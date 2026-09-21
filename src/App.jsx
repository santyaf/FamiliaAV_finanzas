import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeftRight, BadgeDollarSign, Bell, CalendarDays, Users2, ChevronDown, ChevronLeft, CreditCard, FileText, History, Home, Landmark, LayoutGrid, List, Loader2, LogOut, PiggyBank, Plus, Settings, Sparkles, Target, TrendingUp, Upload, X } from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import * as db from './lib/db';
import { formatMoney, formatDate } from './lib/format';
import { todayISO } from './lib/finance';
import { buildNotificationCandidates } from './lib/notifications';
import { mergeNotificationStates, notificationCounts, statePatchFor } from './lib/notificationStates';
import { isAiFeatureEnabled } from './lib/access';
import { isNetworkError, withTimeout, newId, mergePendingTransactions } from './lib/offlineQueue';
import { readJSON, writeJSON, removeKey, getStorage } from './lib/safeStorage';
import { chooseActiveHousehold, normalizeCachedHouseholds, readActiveHouseholdId, saveActiveHouseholdId } from './lib/households';
import { useOfflineQueue, SEND_TIMEOUT_MS } from './lib/useOfflineQueue';
import { OfflineBanner } from './components/OfflineBanner';
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, GOOGLE_FONTS_IMPORT, T, TAP_MIN, inputStyle } from './ui/theme';
import { Card, EmptyState, Field, GhostButton, IconButton, Modal, PrimaryButton } from './ui/primitives';
import Conciliacion from './sections/Conciliacion';
import { Cuentas, AccountModal } from './sections/Cuentas';
import { CardPayModal, CardPlansModal, RedeferModal } from './sections/Tarjetas';
import { Presupuestos, BudgetModal } from './sections/Presupuestos';
import {
  Objetivos, GoalModal, VoteModal, ContributeModal, WithdrawGoalModal, EditGoalModal,
} from './sections/Objetivos';
import {
  Creditos, CreditModal, PayInstallmentModal, ExtraPaymentModal, EditCreditModal,
  CreditInsuranceModal, MemberTransferModal, RefinanceModal,
} from './sections/Creditos';
import {
  Movimientos, TransactionModal, EditTransactionModal, HistoryModal,
} from './sections/Movimientos';
import { Dashboard } from './sections/Dashboard';
import { Ajustes, InviteModal, CategoryModal, ReminderModal } from './sections/Ajustes';
import { Obligaciones, ObligationModal } from './sections/Obligaciones';
import { Tendencias } from './sections/Tendencias';
import { Informes } from './sections/Informes';
import { Asistente } from './sections/Asistente';
import { ResetPasswordScreen, LoadingScreen, AuthScreen, HouseholdSetup } from './sections/auth';
import { AdminPanel } from './sections/AdminPanel';
import { AccountStatusScreen } from './sections/Usuarios';
import { ReceiptsModal } from './sections/Recibos';
import { ImportarExtractos } from './sections/ImportarExtractos';
import { Activos, AssetModal, ValuationModal, SellAssetModal } from './sections/Activos';
import { Calendario } from './sections/Calendario';
import { ReunionMensual } from './sections/ReunionMensual';
import { PinLockScreen } from './sections/PinLock';
import { parseBankMessage } from './lib/smsParser';
import { suggestCategories } from './lib/statementImport';
import { MfaChallengeScreen } from './sections/Mfa';
import { usePinLock } from './lib/usePinLock';
import { NotificationsPanel } from './sections/NotificationsPanel';
import { HouseholdSwitcherModal } from './sections/Hogares';

/* ---------------------------------------------------------------------- */
/* UTILIDADES                                                              */
/* ---------------------------------------------------------------------- */
// Tokens de diseño y constantes → ./ui/theme
// Componentes de UI genéricos (Modal, Field, Card, botones…) → ./ui/primitives
// formatMoney / formatDate → ./lib/format
// Cálculo puro (balances, deudas, amortización, alertas) → ./lib/{finance,amortization,notifications}

/* ---------------------------------------------------------------------- */
/* APP PRINCIPAL — AUTENTICACIÓN Y HOGAR                                   */
/* ---------------------------------------------------------------------- */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [households, setHouseholds] = useState(undefined); // undefined = cargando, [] = sin hogar
  const [activeId, setActiveId] = useState(null);
  const [addingHousehold, setAddingHousehold] = useState(false);
  const pinUnlocked = useRef(false); // el PIN ya se ingresó en esta sesión: cambiar de hogar no lo pide de nuevo
  const household = households === undefined ? undefined : chooseActiveHousehold(households, activeId); // null = sin hogar
  const [joinError, setJoinError] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [accountStatus, setAccountStatus] = useState(undefined); // undefined = cargando
  const [mfaPending, setMfaPending] = useState(undefined); // undefined = comprobando; true = falta el código de 2 pasos

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setHouseholds([]); setAccountStatus(undefined); setMfaPending(undefined); pinUnlocked.current = false; return; }
    db.mfaNeedsChallenge().then((need) => setMfaPending(need === true)).catch(() => setMfaPending(false));
    (async () => {
      // una cuenta desactivada o suspendida no carga datos: ve una pantalla aparte
      try {
        const status = await db.getMyAccountStatus(session.user.id);
        setAccountStatus(status);
        if (status !== 'active') { setHouseholds([]); return; }
        db.touchLastSeen();
      } catch { setAccountStatus('active'); /* sin señal: no bloquear */ }
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      let joinedId = null;
      if (token) {
        try {
          joinedId = await db.redeemInvite(token, session.user.id);
        } catch (e) {
          setJoinError(e.message);
        } finally {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
      await loadHouseholds(session.user.id, joinedId);
    })();
  }, [session]);

  // Carga los hogares de la persona y deja activo el pedido (o el último usado, o el primero).
  // Si no hay señal, usa los últimos conocidos en vez de mandar a "crear hogar" (sería engañoso:
  // el hogar existe, solo no se ve).
  async function loadHouseholds(userId, preferredId) {
    const cacheKey = `fam_household_v1:${userId}`;
    let list;
    try {
      list = await db.getMyHouseholds(userId);
      writeJSON(getStorage(), cacheKey, list);
    } catch (e) {
      list = isNetworkError(e) ? normalizeCachedHouseholds(readJSON(getStorage(), cacheKey, null)) : [];
    }
    const chosen = chooseActiveHousehold(list, preferredId || readActiveHouseholdId(getStorage(), userId));
    if (chosen) saveActiveHouseholdId(getStorage(), userId, chosen.householdId);
    setActiveId(chosen ? chosen.householdId : null);
    setHouseholds(list);
  }
  const switchHousehold = (id) => { setActiveId(id); saveActiveHouseholdId(getStorage(), session.user.id, id); };
  const afterHouseholdChange = async (preferredId) => { setAddingHousehold(false); await loadHouseholds(session.user.id, preferredId); };

  if (recovery) return <ResetPasswordScreen onDone={() => setRecovery(false)} />;
  if (session === undefined || (session && (households === undefined || accountStatus === undefined || mfaPending === undefined))) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (mfaPending) return <MfaChallengeScreen onVerify={async (code) => { await db.mfaVerifyLogin(code); setMfaPending(false); window.location.reload(); }} onSignOut={() => db.signOut()} />;
  if (accountStatus && accountStatus !== 'active') {
    return <AccountStatusScreen status={accountStatus} onSignOut={() => db.signOut()} onReactivate={async () => { await db.reactivateMyAccount(); window.location.reload(); }} />;
  }
  if (!household || addingHousehold) {
    return <HouseholdSetup userId={session.user.id} onReady={afterHouseholdChange} joinError={joinError} onCancel={household ? () => setAddingHousehold(false) : undefined} />;
  }
  return (
    <HouseholdApp
      key={household.householdId} session={session} household={household} households={households}
      onSwitchHousehold={switchHousehold} onAddHousehold={() => setAddingHousehold(true)}
      onLeftHousehold={() => afterHouseholdChange(null)} pinUnlocked={pinUnlocked}
    />
  );
}

/* ---------------------------------------------------------------------- */
/* CARGA DE DATOS DEL HOGAR Y ACCIONES (puente hacia Supabase)             */
/* ---------------------------------------------------------------------- */
function HouseholdApp({ session, household, households, onSwitchHousehold, onAddHousehold, onLeftHousehold, pinUnlocked }) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('unified');
  const [activeMemberId, setActiveMemberId] = useState(null);
  const [householdMeta, setHouseholdMeta] = useState(household.household);
  const [settings, setSettings] = useState(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationStates, setNotificationStates] = useState([]);
  // Créditos activos con sus cuotas — se carga una sola vez por sesión (ya se
  // necesitaba para el motor de notificaciones) y se reusa para Patrimonio
  // neto en el Dashboard, en vez de pedirlo dos veces.
  const [creditsSnapshot, setCreditsSnapshot] = useState([]);
  // true = sin señal al abrir la app: se muestran los últimos datos guardados en
  // este dispositivo hasta que vuelva la conexión (ver cola offline abajo).
  const [stale, setStale] = useState(false);
  const snapKey = `fam_snapshot_v1:${household.householdId}:${session.user.id}`;
  // el dispositivo puede ser compartido: al cerrar sesión no se dejan los datos del hogar guardados
  const signOutAndClear = async () => {
    removeKey(getStorage(), `${snapKey}:raw`);
    removeKey(getStorage(), `${snapKey}:settings`);
    removeKey(getStorage(), `fam_household_v1:${session.user.id}`);
    removeKey(getStorage(), `fam_active_household_v1:${session.user.id}`);
    await db.signOut();
  };
  // bloqueo con PIN en este dispositivo (opcional): tapa la app al abrirla y al volver tras un rato
  const pin = usePinLock({ userId: session.user.id, onSignOut: signOutAndClear, startUnlocked: pinUnlocked.current });
  useEffect(() => { pinUnlocked.current = !pin.locked; }, [pin.locked]);

  async function refresh() {
    const d = await db.loadHouseholdData(household.householdId);
    setRaw(d);
    setStale(false);
    writeJSON(getStorage(), `${snapKey}:raw`, d);
    return d;
  }
  async function refreshSettings() {
    const s = await db.getSettings();
    setSettings(s);
    writeJSON(getStorage(), `${snapKey}:settings`, s);
  }
  async function refreshNotifications() {
    const [list, states] = await Promise.all([
      db.loadNotifications(household.householdId),
      db.loadNotificationStates().catch(() => []), // sin estados, todo se ve como sin leer (no rompe la app)
    ]);
    setNotifications(list);
    setNotificationStates(states);
  }
  useEffect(() => {
    (async () => {
      let d;
      try {
        d = await refresh();
      } catch (e) {
        // Sin señal al abrir: usa lo último que se guardó en este dispositivo.
        const snapRaw = isNetworkError(e) ? readJSON(getStorage(), `${snapKey}:raw`, null) : null;
        if (!snapRaw) throw e;
        setRaw(snapRaw);
        setSettings((cur) => cur ?? readJSON(getStorage(), `${snapKey}:settings`, null));
        setStale(true);
        setLoading(false);
        return;
      }
      setLoading(false);
      // compras diferidas con tarjeta: factura (interés como gasto) las cuotas cuyo corte ya llegó
      try {
        if (await db.applyDueCardBilling(household.householdId, session.user.id)) d = await refresh();
      } catch { /* si falla, se reintenta la próxima vez que se abra la app */ }
      // libranza con registro automático: registra los descuentos de nómina que ya vencieron
      try {
        if (await db.applyDuePayrollDeductions(household.householdId, session.user.id)) d = await refresh();
      } catch { /* si falla, se puede registrar a mano desde Créditos */ }
      // motor de detección: corre una vez por sesión, en silencio, cuando se abre la app
      try {
        const credits = await db.loadCredits(household.householdId);
        const creditsWithPayments = await Promise.all(
          credits.filter((c) => c.status !== 'pagado').map(async (c) => ({ credit: c, payments: await db.loadCreditPayments(c.id) }))
        );
        setCreditsSnapshot(creditsWithPayments);
        const candidates = buildNotificationCandidates(d, creditsWithPayments, session.user.id);
        await db.upsertNotifications(household.householdId, candidates);
      } catch { /* si falla el motor de detección, no debe romper el resto de la app */ }
      await refreshNotifications();
    })();
    refreshSettings().catch(() => setSettings((cur) => cur ?? readJSON(getStorage(), `${snapKey}:settings`, null)));
    db.amIPlatformAdmin(session.user.id).then(setIsPlatformAdmin).catch(() => {});
  }, [household.householdId]);

  // Cola de escrituras offline: los movimientos que no se pudieron enviar por
  // falta de señal se guardan en este dispositivo y se reenvían solos.
  const queue = useOfflineQueue({
    storageKey: `fam_offline_queue_v1:${household.householdId}:${session.user.id}`,
    send: (item) => db.addTransaction(household.householdId, session.user.id, { ...item.payload, id: item.id }),
    onSynced: refresh,
    onReconnect: () => {
      if (!stale) return;
      refresh().catch(() => {});
      refreshSettings().catch(() => {});
    },
  });

  if (pin.locked) return <PinLockScreen onSubmit={pin.unlock} onSignOut={signOutAndClear} />;
  if (loading || !raw || !settings) return <LoadingScreen />;

  const myNotifications = mergeNotificationStates(notifications.filter((n) => !n.userId || n.userId === session.user.id), notificationStates);
  const unreadCount = notificationCounts(myNotifications).unread;

  const data = {
    householdName: householdMeta?.name || '',
    currency: householdMeta?.currency || 'COP',
    viewMode, activeMemberId,
    members: raw.members, categories: raw.categories, accounts: raw.accounts,
    transactions: mergePendingTransactions(raw.transactions, queue.items), goals: raw.goals, budgets: raw.budgets, obligations: raw.obligations, cardPlans: raw.cardPlans || [], attachmentCounts: raw.attachmentCounts || {}, assets: raw.assets || [], templates: raw.templates || [],
    households, activeHouseholdId: household.householdId,
    settings, isPlatformAdmin, notifications: myNotifications, unreadCount, creditsWithPayments: creditsSnapshot,
    offline: { online: queue.online, stale, pending: queue.pending, failed: queue.failed, syncing: queue.syncing },
  };

  function update(patch) {
    if ('viewMode' in patch) setViewMode(patch.viewMode);
    if ('activeMemberId' in patch) setActiveMemberId(patch.activeMemberId);
    if ('householdName' in patch || 'currency' in patch) {
      const next = { ...householdMeta, ...('householdName' in patch ? { name: patch.householdName } : {}), ...('currency' in patch ? { currency: patch.currency } : {}) };
      setHouseholdMeta(next);
      db.updateHousehold(household.householdId, patch).catch(() => {});
    }
  }

  // Las demás acciones necesitan servidor: sin señal fallan con un mensaje claro
  // (solo agregar movimientos usa la cola offline, ver addTransaction).
  const wrap = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      if (isNetworkError(e)) throw new Error('Sin conexión: esta acción necesita internet. Inténtalo de nuevo cuando vuelva la señal.');
      throw e;
    }
    await refresh();
  };

  const actions = {
    userId: session.user.id,
    householdId: household.householdId,
    myRole: household.role,
    // Agregar un movimiento nunca se pierde por falta de señal: si no llega al
    // servidor, queda en la cola offline con un id propio (reintentar no duplica).
    addTransaction: async (t) => {
      const id = newId();
      const queueIt = () => { queue.enqueue({ id, kind: 'addTransaction', payload: t }); return { id, queued: true }; };
      if (!queue.online) return queueIt();
      try {
        await withTimeout(db.addTransaction(household.householdId, session.user.id, { ...t, id }), SEND_TIMEOUT_MS);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        return queueIt();
      }
      try { await refresh(); } catch (e) { if (!isNetworkError(e)) throw e; }
      return { id, queued: false }; // queued: true = aún no está en el servidor (no se le puede adjuntar un recibo)
    },
    importTransactions: async (o) => {
      try { return await db.importTransactions(household.householdId, session.user.id, o); } finally { await refresh(); }
    },
    loadMonthlyReview: (monthKey) => db.loadMonthlyReview(household.householdId, monthKey),
    saveMonthlyDecisions: (monthKey, list) => db.saveMonthlyDecisions(household.householdId, session.user.id, monthKey, list),
    addTemplate: wrap((t) => db.addTemplate(household.householdId, session.user.id, t)),
    deleteTemplate: wrap((id) => db.deleteTemplate(id)),
    createAsset: wrap((a) => db.createAsset(household.householdId, session.user.id, a)),
    updateAsset: wrap((id, a) => db.updateAsset(id, a)),
    addAssetValuation: wrap((assetId, v) => db.addAssetValuation(assetId, v)),
    deleteAssetValuation: wrap((id) => db.deleteAssetValuation(id)),
    sellAsset: wrap((asset, o) => db.sellAsset(household.householdId, session.user.id, asset, o)),
    deleteAsset: wrap((id) => db.deleteAsset(id)),
    loadAttachments: (transactionId) => db.loadAttachments(transactionId),
    uploadAttachment: async (transactionId, file) => { await db.uploadAttachment(household.householdId, transactionId, file); await refresh(); },
    getAttachmentUrl: (path) => db.getAttachmentUrl(path),
    deleteAttachment: wrap((attachment) => db.deleteAttachment(attachment)),
    discardPending: (id) => queue.discard(id),
    retryPending: () => queue.retryFailed(),
    syncNow: () => queue.syncNow(),
    deleteTransaction: wrap((id) => db.deleteTransaction(id)),
    updateTransaction: wrap((original, patch) => db.updateTransactionWithHistory(session.user.id, original, patch)),
    getTransactionHistory: (transactionId) => db.getTransactionHistory(transactionId),
    addSettlement: wrap((from, to, amount) => db.addSettlement(household.householdId, session.user.id, from, to, amount)),
    addGoal: wrap((g) => db.addGoal(household.householdId, g)),
    removeGoal: wrap((id) => db.removeGoal(id)),
    voteGoal: wrap((goalId, votes) => Promise.all(Object.entries(votes).map(([memberId, p]) => db.voteGoal(goalId, memberId, p)))),
    contributeGoal: wrap((goal, amount, memberId, accountId) => db.contributeGoal(household.householdId, session.user.id, goal, amount, memberId, accountId)),
    editOrWithdrawGoal: wrap((goal, action) => db.editOrWithdrawGoal(household.householdId, session.user.id, goal, action)),
    loadPendingGoalRequests: () => db.loadPendingGoalRequests(household.householdId),
    voteOnGoalRequest: async (request, approve) => {
      const status = await db.voteAndResolveGoalRequest(request.id, approve);
      await refresh();
      return status;
    },
    addBudget: wrap((b) => db.addBudget(household.householdId, b)),
    removeBudget: wrap((id) => db.removeBudget(id)),
    addAccount: wrap((a) => db.addAccount(household.householdId, session.user.id, a)),
    updateAccount: wrap((id, a) => db.updateAccount(id, a)),
    payCreditCard: wrap((o) => db.payCreditCard(household.householdId, session.user.id, o)),
    redeferCardPlan: wrap((plan, o) => db.redeferCardPlan(session.user.id, plan, o)),
    deleteCardPlan: wrap((id) => db.deleteCardPlan(id)),
    loadCardPlanEvents: (planId) => db.loadCardPlanEvents(planId),
    removeAccount: wrap((id) => db.removeAccount(id)),
    addObligation: wrap((o) => db.addObligation(household.householdId, session.user.id, o)),
    updateObligation: wrap((id, o) => db.updateObligation(id, o)),
    setObligationEnabled: wrap((id, enabled) => db.setObligationEnabled(id, enabled)),
    removeObligation: wrap((id) => db.removeObligation(id)),
    addCategory: wrap((c) => db.addCategory(household.householdId, c)),
    updateCategory: wrap((id, c) => db.updateCategory(id, c)),
    removeCategory: wrap((id) => db.removeCategory(id)),
    createInvite: () => db.createInvite(household.householdId, session.user.id),
    leaveHousehold: async () => { await db.leaveHousehold(household.householdId, session.user.id); onLeftHousehold(); },
    switchHousehold: onSwitchHousehold,
    addHousehold: onAddHousehold,
    signOut: signOutAndClear,
    refreshAll: async () => { await refresh(); await refreshSettings(); await refreshNotifications(); },
    // créditos
    loadCredits: () => db.loadCredits(household.householdId),
    loadCreditPayments: (creditId) => db.loadCreditPayments(creditId),
    loadCreditExtraPayments: (creditId) => db.loadCreditExtraPayments(creditId),
    createCredit: (credit) => db.createCredit(household.householdId, session.user.id, credit),
    deleteCredit: (id) => db.deleteCredit(id),
    updateCredit: (creditId, patch, currentCredit, payments) => db.updateCreditAndRecalc(creditId, patch, currentCredit, payments, session.user.id),
    loadCreditInsurances: (creditId) => db.loadCreditInsurances(creditId),
    addCreditInsurance: (creditId, insurance) => db.addCreditInsurance(creditId, insurance),
    removeCreditInsurance: (id, creditId) => db.removeCreditInsurance(id, creditId),
    markInstallmentPaid: (credit, installment, accountId, memberId, categoryId, options) =>
      db.markInstallmentPaid(household.householdId, session.user.id, credit, installment, accountId, memberId, categoryId, options),
    unmarkInstallmentPaid: (credit, installment, payments) => db.unmarkInstallmentPaid(session.user.id, credit, installment, payments),
    refinanceCredit: (credit, payments, options) => db.refinanceCredit(household.householdId, session.user.id, credit, payments, options),
    loadCreditEvents: (creditId) => db.loadCreditEvents(creditId),
    applyExtraPayment: (credit, payments, extraAmount, strategy, applyDate, accountId, memberId, categoryId, registerAsExpense, uvrValue) =>
      db.applyExtraPayment(household.householdId, session.user.id, credit, payments, extraAmount, strategy, applyDate, accountId, memberId, categoryId, registerAsExpense, uvrValue),
    getLatestUvr: () => db.getLatestUvr(),
    saveManualUvr: (date, value) => db.saveManualUvr(date, value),
    addMemberTransfer: wrap((t) => db.addMemberTransfer(household.householdId, session.user.id, t)),
    // configuración global / superusuario
    updateSetting: async (key, value) => { await db.updateSetting(key, value, session.user.id); await refreshSettings(); },
    listAllHouseholdsAdmin: () => db.listAllHouseholdsAdmin(),
    listPlatformAdmins: () => db.listPlatformAdmins(),
    loadCronHeartbeat: () => db.loadCronHeartbeat(),
    deactivateMyAccount: () => db.deactivateMyAccount(),
    mfa: { listFactors: db.mfaListFactors, enroll: db.mfaEnroll, verifyEnroll: db.mfaVerifyEnroll, unenroll: db.mfaUnenroll },
    adminListUsers: () => db.adminListUsers(),
    adminSetUserStatus: (userId, status, reason) => db.adminSetUserStatus(userId, status, reason),
    promoteToAdmin: (email) => db.promoteToAdmin(email),
    removeAdmin: (userId) => db.removeAdmin(userId),
    // sugerencias de mejora (chat del Asistente → administrador)
    addSuggestion: async (suggestion) => {
      const id = await db.addSuggestion(session.user.id, household.householdId, suggestion);
      db.notifyAdminsOfSuggestion(id);
      return id;
    },
    loadMySuggestions: () => db.loadMySuggestions(session.user.id),
    listAllSuggestions: () => db.listAllSuggestions(),
    updateSuggestion: (id, patch) => db.updateSuggestion(id, session.user.id, patch),
    // notificaciones push / recordatorios
    savePushSubscription: (sub) => db.savePushSubscription(session.user.id, sub),
    removePushSubscription: (endpoint) => db.removePushSubscription(endpoint),
    loadReminderSchedules: () => db.loadReminderSchedules(session.user.id),
    addReminderSchedule: (schedule) => db.addReminderSchedule(session.user.id, schedule),
    updateReminderSchedule: (id, patch) => db.updateReminderSchedule(id, patch),
    removeReminderSchedule: (id) => db.removeReminderSchedule(id),
    // notificaciones
    // leer / archivar / desarchivar / eliminar (lógico) una o varias notificaciones, solo para mí
    setNotificationsState: async (ids, action) => {
      await db.setNotificationStates(session.user.id, ids, statePatchFor(action, new Date().toISOString()));
      await refreshNotifications();
    },
  };

  return <MainApp data={data} update={update} actions={actions} />;
}

/* ---------------------------------------------------------------------- */
/* MAIN APP                                                                */
/* ---------------------------------------------------------------------- */
// Barra inferior: siempre 5 botones. "Agregar" (antes "Registro rápido") es
// un atajo directo al formulario manual de movimiento, no una pestaña — vive
// donde antes vivía Registro rápido, que ahora es parte del Asistente
// (botón flotante + tarjeta en Gestión). Créditos, Objetivos, Presupuestos,
// Conciliación y Cuentas viven dentro de "Gestión". Administración vive
// dentro de Ajustes (solo la ve un superusuario).
const TABS = [
  { id: 'dashboard', label: 'Inicio', icon: Home },
  { id: 'movimientos', label: 'Movimientos', icon: List },
  { id: 'agregar', label: 'Agregar', icon: Plus, action: 'addTransaction' },
  { id: 'gestion', label: 'Gestión', icon: LayoutGrid },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
];

// Secciones agrupadas dentro de "Gestión" (grid de tarjetas con descripción).
const GESTION_SECTIONS = [
  { id: 'creditos', label: 'Créditos', icon: CreditCard, desc: 'Préstamos en COP y UVR: cuotas, amortización, seguros y abonos a capital.' },
  { id: 'objetivos', label: 'Objetivos', icon: Target, desc: 'Metas de ahorro familiares e individuales, con aprobación del hogar.' },
  { id: 'presupuestos', label: 'Presupuestos', icon: PiggyBank, desc: 'Límites de gasto por categoría, para todo el hogar o por integrante.' },
  { id: 'obligaciones', label: 'Obligaciones', icon: Bell, desc: 'Recordatorios de pagos por vencer — arriendo, servicios, suscripciones.' },
  { id: 'tendencias', label: 'Tendencias', icon: TrendingUp, desc: 'Flujo de caja y gasto por categoría de los últimos meses.' },
  { id: 'reunion', label: 'Reunión mensual', icon: Users2, desc: 'Revisen el mes juntos, paso a paso, y dejen decisiones para el siguiente.' },
  { id: 'calendario', label: 'Calendario', icon: CalendarDays, desc: 'Lo que entra y sale cada día: recurrentes, obligaciones, cuotas, tarjetas, metas y vencimientos.' },
  { id: 'activos', label: 'Activos', icon: BadgeDollarSign, desc: 'Propiedades, vehículos, inversiones y cuentas por cobrar, con su valor a hoy y su historial.' },
  { id: 'importar', label: 'Importar extracto', icon: Upload, desc: 'Sube el CSV de tu banco o pega filas desde Excel: revisa, categoriza y evita duplicados.' },
  { id: 'informes', label: 'Informes', icon: FileText, desc: 'Estado de resultados y flujo de efectivo por mes, trimestre, semestre o año — personal o del hogar.' },
  { id: 'asistente', label: 'Asistente IA', icon: Sparkles, desc: 'Pregúntale sobre tus finanzas, o regístralas por chat o foto de recibo.', requiresAiChat: true },
  { id: 'conciliacion', label: 'Conciliación', icon: ArrowLeftRight, desc: 'Quién le debe a quién por los gastos compartidos, y cómo saldar.' },
  { id: 'cuentas', label: 'Cuentas', icon: Landmark, desc: 'Cuentas bancarias y efectivo, individuales o compartidas.' },
];
const GESTION_IDS = GESTION_SECTIONS.map((s) => s.id);

// Rutas válidas (para el enrutado por hash). "dashboard" es la ruta por
// defecto y usa el hash vacío; el resto son `#/<id>`. Las pestañas de
// acción (ej. "Agregar") no navegan a ninguna parte, así que no son rutas.
const ROUTES = new Set([...TABS.filter((t) => !t.action).map((t) => t.id), ...GESTION_IDS, 'admin']);

// Enrutado por hash: cada sección tiene su URL (`#/creditos`), el botón "atrás"
// del navegador/celular funciona, y se pueden compartir enlaces a una sección.
// Hash (no History API) para no necesitar rewrites en Vercel y no romper el
// flujo de invitación por `?token=`.
function useHashRoute(fallback) {
  const parse = () => {
    const [r] = window.location.hash.replace(/^#\/?/, '').split('?');
    return ROUTES.has(r) ? r : fallback;
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((r) => {
    const next = ROUTES.has(r) ? r : fallback;
    const target = next === fallback ? '' : `/${next}`;
    if (window.location.hash.replace(/^#/, '') !== target) window.location.hash = target;
    setRoute(next);
  }, [fallback]);
  return [route, navigate];
}

function MainApp({ data, update, actions }) {
  const [tab, setTab] = useHashRoute('dashboard');
  const [modal, setModal] = useState(null); // {type: 'transaction'|'goal'|'invite'|'account'|'budget'|'vote'|'contribute'|'category', payload}

  // Deep-link desde un recordatorio de obligación (notificación push → "#/movimientos?ob=<id>"):
  // abre el registro de gasto ya prellenado. Se revisa solo al montar — para
  // entonces los datos del hogar (incluidas las obligaciones) ya cargaron.
  const handledObligationLinkRef = useRef(false);
  useEffect(() => {
    if (handledObligationLinkRef.current) return;
    const query = window.location.hash.split('?')[1];
    const obligationId = query ? new URLSearchParams(query).get('ob') : null;
    if (!obligationId) return;
    handledObligationLinkRef.current = true;
    window.location.hash = window.location.hash.split('?')[0] || '/movimientos';
    const ob = data.obligations?.find((o) => o.id === obligationId);
    if (ob) {
      setModal({
        type: 'transaction',
        payload: {
          source: 'obligation', type: 'expense', description: ob.name,
          amount: ob.amount ?? undefined, categoryId: ob.categoryId || undefined,
          accountId: ob.accountId || undefined, memberId: ob.ownerMemberId || undefined,
          date: todayISO(),
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atajos de la app instalada (mantener pulsado el ícono) y "Compartir" un SMS del banco hacia la app:
  //   #/movimientos?nuevo=gasto | ingreso   → abre el formulario
  //   #/?asistente=1                          → abre el chat
  //   /?text=<mensaje>                        → lee el SMS y abre el formulario con lo que entendió
  // También sirven como enlace para un atajo de iOS ("Abrir URL"). Se revisa una vez, al montar.
  const handledLaunchRef = useRef(false);
  useEffect(() => {
    if (handledLaunchRef.current) return;
    const search = new URLSearchParams(window.location.search);
    const shared = [search.get('title'), search.get('text'), search.get('url')].filter(Boolean).join(' ').trim();
    const hashQuery = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const nuevo = hashQuery.get('nuevo');
    const asistente = hashQuery.get('asistente');
    if (!shared && !nuevo && !asistente) return;
    handledLaunchRef.current = true;
    const hashPath = window.location.hash.split('?')[0];
    if (shared) window.history.replaceState({}, '', `${window.location.pathname}${hashPath}`);
    else window.location.hash = hashPath || '/movimientos';
    if (shared) {
      const parsed = parseBankMessage(shared, { todayISO: todayISO() });
      const type = parsed.type || 'expense';
      const categoryId = parsed.amount ? suggestCategories([{ type, description: parsed.description || '' }], data.transactions, data.categories)[0]?.categoryId : undefined;
      setModal({
        type: 'transaction',
        payload: { source: 'quick', raw: shared.slice(0, 200), type, amount: parsed.amount || undefined, description: parsed.description || (parsed.amount ? '' : shared.slice(0, 80)), date: parsed.date || todayISO(), categoryId: categoryId || undefined },
      });
    } else if (nuevo) {
      setModal({ type: 'transaction', payload: { type: nuevo === 'ingreso' ? 'income' : 'expense' } });
    } else if (asistente) {
      setModal({ type: 'assistant' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El proveedor de IA es compartido; si está en "none" ninguna función de
  // IA funciona sin importar el acceso por persona configurado en Admin.
  // "Registro rápido" (chat/foto) y el Asistente (preguntas) se activan por
  // separado, pero ambos viven ahora en la misma pantalla (Asistente): el
  // botón flotante y la tarjeta de Gestión aparecen si tienes acceso a
  // cualquiera de los dos; dentro, cada pestaña se habilita según su propio
  // acceso.
  const aiProviderConfigured = data.settings?.ai_provider && data.settings.ai_provider !== 'none';
  const quickCaptureEnabled = aiProviderConfigured && isAiFeatureEnabled(data.settings?.quick_capture_access, actions.userId);
  const assistantEnabled = aiProviderConfigured && isAiFeatureEnabled(data.settings?.assistant_access, actions.userId);
  const aiChatAvailable = quickCaptureEnabled || assistantEnabled;
  const navTabs = TABS;
  const visibleGestionSections = GESTION_SECTIONS.filter((s) => !(s.requiresAiChat && !aiChatAvailable));
  // "Gestión" queda resaltado en la barra mientras estés en cualquiera de sus secciones.
  const inGestion = tab === 'gestion' || GESTION_IDS.includes(tab);
  const backTo = GESTION_IDS.includes(tab) ? { id: 'gestion', label: 'Gestión' }
    : tab === 'admin' ? { id: 'ajustes', label: 'Ajustes' }
    : null;

  const currency = data.currency;
  const membersById = useMemo(() => Object.fromEntries(data.members.map((m) => [m.id, m])), [data.members]);

  const visibleMemberId = data.viewMode === 'individual' ? (data.activeMemberId || data.members[0]?.id) : null;

  // transacciones visibles según el modo
  const visibleTransactions = useMemo(() => {
    if (data.viewMode === 'unified') return data.transactions;
    return data.transactions.filter((t) => t.memberId === visibleMemberId || t.type === 'settlement');
  }, [data.transactions, data.viewMode, visibleMemberId]);

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: FONT_BODY, paddingBottom: 84 }}>
      <style>{`${GOOGLE_FONTS_IMPORT}`}</style>

      {/* Header */}
      <div className="px-5 pt-6 pb-4 sticky top-0 z-10" style={{ background: T.bg }}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <button onClick={() => setModal({ type: 'households' })} aria-label={`Hogar ${data.householdName}: cambiar o agregar hogar`} className="flex items-center gap-1 text-left max-w-full">
              <span className="truncate" style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, color: T.ink }}>{data.householdName}</span>
              <ChevronDown size={18} color={T.inkSoft} style={{ flexShrink: 0 }} />
            </button>
            <p style={{ color: T.inkSoft, fontSize: 12.5 }}>{data.members.length} integrantes · {currency}{data.households?.length > 1 ? ` · ${data.households.length} hogares` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <ViewModeToggle data={data} update={update} />
            <button onClick={() => setModal({ type: 'notifications' })} aria-label="Notificaciones" title="Notificaciones" className="relative flex items-center justify-center rounded-full active:scale-90 transition-transform" style={{ width: TAP_MIN, height: TAP_MIN, background: T.surface, border: `1px solid ${T.border}` }}>
              <Bell size={17} color={T.inkSoft} />
              {data.unreadCount > 0 && (
                <span className="absolute flex items-center justify-center" style={{ top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, background: T.coral, padding: '0 3px' }}>
                  <span style={{ fontSize: 9.5, color: '#fff', fontFamily: FONT_BODY, fontWeight: 700 }}>{data.unreadCount > 9 ? '9+' : data.unreadCount}</span>
                </span>
              )}
            </button>
            <button onClick={actions.signOut} aria-label="Cerrar sesión" title="Cerrar sesión" className="flex items-center justify-center rounded-full active:scale-90 transition-transform" style={{ width: TAP_MIN, height: TAP_MIN, background: T.surface, border: `1px solid ${T.border}` }}>
              <LogOut size={17} color={T.inkSoft} />
            </button>
          </div>
        </div>
        <OfflineBanner {...data.offline} onSyncNow={data.offline.failed > 0 ? actions.retryPending : actions.syncNow} />
        {data.viewMode === 'individual' && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {data.members.map((m) => (
              <button key={m.id} onClick={() => update({ activeMemberId: m.id })}
                className="flex-shrink-0 rounded-full px-3 py-1.5 flex items-center gap-1.5"
                style={{ background: visibleMemberId === m.id ? m.color : T.surface, border: `1px solid ${visibleMemberId === m.id ? m.color : T.border}` }}>
                <span style={{ color: visibleMemberId === m.id ? '#fff' : T.ink, fontSize: 13, fontFamily: FONT_BODY, fontWeight: 500 }}>{m.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-5">
        {backTo && (
          <button onClick={() => setTab(backTo.id)} className="flex items-center gap-1 mb-2 -ml-1 active:opacity-60"
            style={{ minHeight: 40 }}>
            <ChevronLeft size={18} color={T.inkSoft} />
            <span style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 500 }}>{backTo.label}</span>
          </button>
        )}
        <PullToRefresh onRefresh={actions.refreshAll}>
          {tab === 'dashboard' && <Dashboard data={data} update={update} actions={actions} visibleTransactions={visibleTransactions} visibleMemberId={visibleMemberId} setModal={setModal} setTab={setTab} />}
          {tab === 'movimientos' && <Movimientos data={data} actions={actions} visibleTransactions={visibleTransactions} setModal={setModal} />}
          {tab === 'gestion' && <Gestion setTab={setTab} sections={visibleGestionSections} />}
          {tab === 'creditos' && <Creditos data={data} actions={actions} setModal={setModal} />}
          {tab === 'objetivos' && <Objetivos data={data} actions={actions} setModal={setModal} />}
          {tab === 'presupuestos' && <Presupuestos data={data} actions={actions} setModal={setModal} />}
          {tab === 'obligaciones' && <Obligaciones data={data} actions={actions} setModal={setModal} />}
          {tab === 'tendencias' && <Tendencias data={data} />}
          {tab === 'informes' && <Informes data={data} actions={actions} />}
          {tab === 'importar' && <ImportarExtractos data={data} actions={actions} />}
          {tab === 'activos' && <Activos data={data} actions={actions} setModal={setModal} />}
          {tab === 'calendario' && <Calendario data={data} />}
          {tab === 'reunion' && <ReunionMensual data={data} actions={actions} />}
          {tab === 'asistente' && aiChatAvailable && <Asistente data={data} actions={actions} visibleTransactions={visibleTransactions} setModal={setModal} />}
          {tab === 'conciliacion' && <Conciliacion data={data} actions={actions} />}
          {tab === 'cuentas' && <Cuentas data={data} actions={actions} setModal={setModal} />}
          {tab === 'ajustes' && <Ajustes data={data} update={update} actions={actions} setModal={setModal} setTab={setTab} pin={pin} />}
          {tab === 'admin' && data.isPlatformAdmin && <AdminPanel data={data} actions={actions} />}
        </PullToRefresh>
      </div>

      {/* Nav inferior */}
      <div className="fixed bottom-0 left-0 right-0 z-20" style={{ background: T.surface, borderTop: `1px solid ${T.border}` }}>
        <div className="flex justify-around px-2 py-2">
          {navTabs.map((tItem) => {
            const Icon = tItem.icon;
            const active = tItem.id === 'gestion' ? inGestion : tab === tItem.id;
            const onClick = tItem.action === 'addTransaction' ? () => setModal({ type: 'transaction' }) : () => setTab(tItem.id);
            // La acción principal ("Agregar") sobresale de la barra, en un círculo
            // de color sólido con borde del color de la barra para que destaque.
            if (tItem.action) {
              return (
                <button key={tItem.id} onClick={onClick} aria-label="Agregar movimiento" className="flex flex-col items-center gap-0.5 px-2" style={{ minWidth: 64, marginTop: -28 }}>
                  <span className="flex items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform"
                    style={{ width: 58, height: 58, background: T.coral, border: `4px solid ${T.surface}` }}>
                    <Icon size={28} color="#fff" strokeWidth={2.6} />
                  </span>
                  <span style={{ fontSize: 10.5, color: T.coral, fontFamily: FONT_BODY, fontWeight: 700 }}>{tItem.label}</span>
                </button>
              );
            }
            return (
              <button key={tItem.id} onClick={onClick} className="flex flex-col items-center gap-0.5 px-2 py-1" style={{ minWidth: 56, minHeight: TAP_MIN }}>
                <Icon size={20} color={active ? T.teal : T.inkSoft} />
                <span style={{ fontSize: 10.5, color: active ? T.teal : T.inkSoft, fontFamily: FONT_BODY, fontWeight: active ? 600 : 400 }}>{tItem.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Botón flotante del Asistente (chat + registro por foto/texto) —
          antes era el "+" de agregar movimiento; ese atajo ahora vive en la
          barra inferior. Solo aparece si esta persona tiene acceso a alguna
          de las dos funciones de IA. */}
      {aiChatAvailable && (
        <button onClick={() => setModal({ type: 'assistant' })}
          className="fixed z-20 rounded-full flex items-center justify-center shadow-lg"
          style={{ right: 20, bottom: 92, width: 56, height: 56, background: T.teal }}>
          <Sparkles color="#fff" size={24} />
        </button>
      )}

      {/* Popup compacto (no el Modal genérico de pantalla completa) — anclado
          cerca del botón flotante, sin oscurecer el resto de la app. */}
      {modal?.type === 'assistant' && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setModal(null)} />
          <div
            className="fixed z-50 rounded-2xl shadow-lg flex flex-col overflow-hidden"
            style={{
              right: 16, bottom: 156, width: 'min(94vw, 380px)', height: 'min(68vh, 560px)',
              background: T.surface, border: `1px solid ${T.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: T.border }}>
              <h3 style={{ fontFamily: FONT_DISPLAY, color: T.ink }} className="text-base font-semibold">Asistente</h3>
              <IconButton icon={X} onClick={() => setModal(null)} label="Cerrar" />
            </div>
            <div className="px-4 py-3 flex-1 min-h-0 flex flex-col">
              <Asistente data={data} actions={actions} visibleTransactions={visibleTransactions} setModal={setModal} variant="popup" />
            </div>
          </div>
        </>
      )}

      {modal?.type === 'transaction' && <TransactionModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'editTransaction' && <EditTransactionModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'asset' && <AssetModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'assetValuation' && <ValuationModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'sellAsset' && <SellAssetModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'receipts' && <ReceiptsModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'history' && <HistoryModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'goal' && <GoalModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'editGoal' && <EditGoalModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'withdrawGoal' && <WithdrawGoalModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'invite' && <InviteModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'account' && <AccountModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'budget' && <BudgetModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'obligation' && <ObligationModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'vote' && <VoteModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'contribute' && <ContributeModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'category' && <CategoryModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'households' && <HouseholdSwitcherModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'notifications' && <NotificationsPanel data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'credit' && <CreditModal data={data} actions={actions} onClose={() => setModal(null)} onCreated={modal.onCreated} />}
      {modal?.type === 'extraPayment' && <ExtraPaymentModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
      {modal?.type === 'payInstallment' && <PayInstallmentModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
      {modal?.type === 'editCredit' && <EditCreditModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
      {modal?.type === 'refinanceCredit' && <RefinanceModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
      {modal?.type === 'creditInsurance' && <CreditInsuranceModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
      {modal?.type === 'cardPay' && <CardPayModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'cardPlans' && <CardPlansModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} setModal={setModal} />}
      {modal?.type === 'redeferPlan' && <RedeferModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(modal.payload.account ? { type: 'cardPlans', payload: { account: modal.payload.account } } : null)} />}
      {modal?.type === 'memberTransfer' && <MemberTransferModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'reminder' && <ReminderModal actions={actions} onClose={() => setModal(null)} onDone={modal.onDone} />}
    </div>
  );
}

// Deslizar hacia abajo (estando arriba del todo) para refrescar los datos —
// necesario porque, instalada como PWA en pantalla completa, el navegador ya
// no ofrece su gesto nativo de "pull to refresh". No cambia el scroll de la
// página (sigue siendo el del documento), solo detecta el gesto y muestra un
// indicador mientras se refrescan los datos.
function PullToRefresh({ onRefresh, children }) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const THRESHOLD = 70;

  function onTouchStart(e) {
    if (window.scrollY <= 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }
  function onTouchMove(e) {
    if (!pulling || window.scrollY > 0) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setDragY(Math.min(delta * 0.5, 100));
  }
  async function onTouchEnd() {
    if (pulling && dragY > THRESHOLD) {
      setRefreshing(true);
      try { await onRefresh(); } finally { setRefreshing(false); }
    }
    setPulling(false);
    setDragY(0);
  }

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="flex items-center justify-center overflow-hidden transition-all" style={{ height: refreshing ? 44 : dragY }}>
        <Loader2 size={20} color={T.teal} className={refreshing || dragY > THRESHOLD ? 'animate-spin' : ''} style={{ opacity: Math.min(dragY / THRESHOLD, 1) }} />
      </div>
      {children}
    </div>
  );
}

// "Gestión" — grid de tarjetas que agrupa las secciones de administración a
// fondo del hogar (Créditos, Objetivos, Presupuestos, Conciliación, Cuentas).
function Gestion({ setTab, sections }) {
  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-1">Gestión</p>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Todas las herramientas para administrar las finanzas del hogar a fondo. Toca una para abrirla.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => setTab(s.id)}
              className="text-left rounded-2xl p-4 flex flex-col gap-2 active:scale-[0.98] transition-transform"
              style={{ background: T.surface, border: `1px solid ${T.border}`, minHeight: 148 }}>
              <div className="rounded-xl flex items-center justify-center" style={{ width: 38, height: 38, background: T.tealSoft }}>
                <Icon size={19} color={T.teal} />
              </div>
              <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>{s.label}</span>
              <span style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY, lineHeight: 1.45 }}>{s.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ViewModeToggle({ data, update }) {
  return (
    <div className="flex rounded-full p-1" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      <button onClick={() => update({ viewMode: 'unified' })} className="px-3 py-1 rounded-full" style={{ background: data.viewMode === 'unified' ? T.ink : 'transparent' }}>
        <span style={{ fontSize: 12.5, color: data.viewMode === 'unified' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 500 }}>Unificado</span>
      </button>
      <button onClick={() => update({ viewMode: 'individual', activeMemberId: data.activeMemberId || data.members[0]?.id })} className="px-3 py-1 rounded-full" style={{ background: data.viewMode === 'individual' ? T.ink : 'transparent' }}>
        <span style={{ fontSize: 12.5, color: data.viewMode === 'individual' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 500 }}>Individual</span>
      </button>
    </div>
  );
}




