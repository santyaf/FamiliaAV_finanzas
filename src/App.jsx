import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ArrowLeftRight, Bell, ChevronLeft, CreditCard, History, Home, Landmark, LayoutGrid, List, Loader2, LogOut, MessageCircle, PiggyBank, Plus, Settings, Target } from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import * as db from './lib/db';
import { formatMoney, formatDate } from './lib/format';
import { buildNotificationCandidates } from './lib/notifications';
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, GOOGLE_FONTS_IMPORT, T, TAP_MIN, inputStyle } from './ui/theme';
import { Card, EmptyState, Field, GhostButton, IconButton, Modal, PrimaryButton } from './ui/primitives';
import Conciliacion from './sections/Conciliacion';
import { Cuentas, AccountModal } from './sections/Cuentas';
import { Presupuestos, BudgetModal } from './sections/Presupuestos';
import {
  Objetivos, GoalModal, VoteModal, ContributeModal, WithdrawGoalModal, EditGoalModal,
} from './sections/Objetivos';
import {
  Creditos, CreditModal, PayInstallmentModal, ExtraPaymentModal, EditCreditModal,
  CreditInsuranceModal, MemberTransferModal,
} from './sections/Creditos';
import { QuickCapture } from './sections/QuickCapture';
import {
  Movimientos, TransactionModal, EditTransactionModal, HistoryModal,
} from './sections/Movimientos';
import { Dashboard } from './sections/Dashboard';
import { Ajustes, InviteModal, CategoryModal, ReminderModal } from './sections/Ajustes';
import { ResetPasswordScreen, LoadingScreen, AuthScreen, HouseholdSetup } from './sections/auth';
import { AdminPanel } from './sections/AdminPanel';
import { NotificationsPanel } from './sections/NotificationsPanel';

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
  const [household, setHousehold] = useState(undefined); // undefined = cargando, null = sin hogar
  const [joinError, setJoinError] = useState('');
  const [recovery, setRecovery] = useState(false);

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
    if (!session) { setHousehold(null); return; }
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      if (token) {
        try {
          await db.redeemInvite(token, session.user.id);
        } catch (e) {
          setJoinError(e.message);
        } finally {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
      try {
        setHousehold(await db.getMyHousehold(session.user.id));
      } catch {
        setHousehold(null);
      }
    })();
  }, [session]);

  if (recovery) return <ResetPasswordScreen onDone={() => setRecovery(false)} />;
  if (session === undefined || (session && household === undefined)) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (!household) return <HouseholdSetup userId={session.user.id} onReady={setHousehold} joinError={joinError} />;
  return <HouseholdApp session={session} household={household} onLeftHousehold={() => setHousehold(null)} />;
}

/* ---------------------------------------------------------------------- */
/* CARGA DE DATOS DEL HOGAR Y ACCIONES (puente hacia Supabase)             */
/* ---------------------------------------------------------------------- */
function HouseholdApp({ session, household, onLeftHousehold }) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('unified');
  const [activeMemberId, setActiveMemberId] = useState(null);
  const [householdMeta, setHouseholdMeta] = useState(household.household);
  const [settings, setSettings] = useState(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [notifications, setNotifications] = useState([]);

  async function refresh() {
    const d = await db.loadHouseholdData(household.householdId);
    setRaw(d);
    return d;
  }
  async function refreshSettings() {
    setSettings(await db.getSettings());
  }
  async function refreshNotifications() {
    setNotifications(await db.loadNotifications(household.householdId));
  }
  useEffect(() => {
    (async () => {
      const d = await refresh();
      setLoading(false);
      // motor de detección: corre una vez por sesión, en silencio, cuando se abre la app
      try {
        const credits = await db.loadCredits(household.householdId);
        const creditsWithPayments = await Promise.all(
          credits.filter((c) => c.status !== 'pagado').map(async (c) => ({ credit: c, payments: await db.loadCreditPayments(c.id) }))
        );
        const candidates = buildNotificationCandidates(d, creditsWithPayments, session.user.id);
        await db.upsertNotifications(household.householdId, candidates);
      } catch { /* si falla el motor de detección, no debe romper el resto de la app */ }
      await refreshNotifications();
    })();
    refreshSettings();
    db.amIPlatformAdmin(session.user.id).then(setIsPlatformAdmin).catch(() => {});
  }, [household.householdId]);

  if (loading || !raw || !settings) return <LoadingScreen />;

  const myNotifications = notifications.filter((n) => !n.userId || n.userId === session.user.id);
  const unreadCount = myNotifications.filter((n) => !n.read).length;

  const data = {
    householdName: householdMeta?.name || '',
    currency: householdMeta?.currency || 'COP',
    viewMode, activeMemberId,
    members: raw.members, categories: raw.categories, accounts: raw.accounts,
    transactions: raw.transactions, goals: raw.goals, budgets: raw.budgets,
    settings, isPlatformAdmin, notifications: myNotifications, unreadCount,
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

  const wrap = (fn) => async (...args) => { await fn(...args); await refresh(); };

  const actions = {
    userId: session.user.id,
    householdId: household.householdId,
    myRole: household.role,
    addTransaction: wrap((t) => db.addTransaction(household.householdId, session.user.id, t)),
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
    removeAccount: wrap((id) => db.removeAccount(id)),
    addCategory: wrap((c) => db.addCategory(household.householdId, c)),
    removeCategory: wrap((id) => db.removeCategory(id)),
    createInvite: () => db.createInvite(household.householdId, session.user.id),
    leaveHousehold: async () => { await db.leaveHousehold(household.householdId, session.user.id); onLeftHousehold(); },
    signOut: () => db.signOut(),
    refreshAll: async () => { await refresh(); await refreshSettings(); await refreshNotifications(); },
    // créditos
    loadCredits: () => db.loadCredits(household.householdId),
    loadCreditPayments: (creditId) => db.loadCreditPayments(creditId),
    loadCreditExtraPayments: (creditId) => db.loadCreditExtraPayments(creditId),
    createCredit: (credit) => db.createCredit(household.householdId, session.user.id, credit),
    deleteCredit: (id) => db.deleteCredit(id),
    updateCredit: (creditId, patch, currentCredit, payments) => db.updateCreditAndRecalc(creditId, patch, currentCredit, payments),
    loadCreditInsurances: (creditId) => db.loadCreditInsurances(creditId),
    addCreditInsurance: (creditId, insurance) => db.addCreditInsurance(creditId, insurance),
    removeCreditInsurance: (id, creditId) => db.removeCreditInsurance(id, creditId),
    markInstallmentPaid: (credit, installment, accountId, memberId, categoryId) =>
      db.markInstallmentPaid(household.householdId, session.user.id, credit, installment, accountId, memberId, categoryId),
    applyExtraPayment: (credit, payments, extraAmount, strategy, applyDate, accountId, memberId, categoryId, registerAsExpense) =>
      db.applyExtraPayment(household.householdId, session.user.id, credit, payments, extraAmount, strategy, applyDate, accountId, memberId, categoryId, registerAsExpense),
    getLatestUvr: () => db.getLatestUvr(),
    saveManualUvr: (date, value) => db.saveManualUvr(date, value),
    addMemberTransfer: wrap((t) => db.addMemberTransfer(household.householdId, session.user.id, t)),
    // configuración global / superusuario
    updateSetting: async (key, value) => { await db.updateSetting(key, value, session.user.id); await refreshSettings(); },
    listAllHouseholdsAdmin: () => db.listAllHouseholdsAdmin(),
    listPlatformAdmins: () => db.listPlatformAdmins(),
    promoteToAdmin: (email) => db.promoteToAdmin(email),
    removeAdmin: (userId) => db.removeAdmin(userId),
    // notificaciones push / recordatorios
    savePushSubscription: (sub) => db.savePushSubscription(session.user.id, sub),
    removePushSubscription: (endpoint) => db.removePushSubscription(endpoint),
    loadReminderSchedules: () => db.loadReminderSchedules(session.user.id),
    addReminderSchedule: (schedule) => db.addReminderSchedule(session.user.id, schedule),
    updateReminderSchedule: (id, patch) => db.updateReminderSchedule(id, patch),
    removeReminderSchedule: (id) => db.removeReminderSchedule(id),
    // notificaciones
    markNotificationRead: async (id) => { await db.markNotificationRead(id); await refreshNotifications(); },
    markAllNotificationsRead: async () => { await db.markAllNotificationsRead(household.householdId, session.user.id); await refreshNotifications(); },
    deleteNotification: async (id) => { await db.deleteNotification(id); await refreshNotifications(); },
  };

  return <MainApp data={data} update={update} actions={actions} />;
}

/* ---------------------------------------------------------------------- */
/* MAIN APP                                                                */
/* ---------------------------------------------------------------------- */
// Barra inferior: como máximo 5 botones (evita el scroll lateral en celular).
// "Registro rápido" solo aparece si el hogar lo tiene activado; cuando está
// desactivado la barra queda con 4. Créditos, Objetivos, Presupuestos,
// Conciliación y Cuentas ya no están en la barra: viven dentro de "Gestión".
// Administración vive dentro de Ajustes (solo la ve un superusuario).
const TABS = [
  { id: 'dashboard', label: 'Inicio', icon: Home },
  { id: 'movimientos', label: 'Movimientos', icon: List },
  { id: 'rapido', label: 'Registro rápido', icon: MessageCircle, requiresQuickCapture: true },
  { id: 'gestion', label: 'Gestión', icon: LayoutGrid },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
];

// Secciones agrupadas dentro de "Gestión" (grid de tarjetas con descripción).
const GESTION_SECTIONS = [
  { id: 'creditos', label: 'Créditos', icon: CreditCard, desc: 'Préstamos en COP y UVR: cuotas, amortización, seguros y abonos a capital.' },
  { id: 'objetivos', label: 'Objetivos', icon: Target, desc: 'Metas de ahorro familiares e individuales, con aprobación del hogar.' },
  { id: 'presupuestos', label: 'Presupuestos', icon: PiggyBank, desc: 'Límites de gasto por categoría, para todo el hogar o por integrante.' },
  { id: 'conciliacion', label: 'Conciliación', icon: ArrowLeftRight, desc: 'Quién le debe a quién por los gastos compartidos, y cómo saldar.' },
  { id: 'cuentas', label: 'Cuentas', icon: Landmark, desc: 'Cuentas bancarias y efectivo, individuales o compartidas.' },
];
const GESTION_IDS = GESTION_SECTIONS.map((s) => s.id);

// Rutas válidas (para el enrutado por hash). "dashboard" es la ruta por
// defecto y usa el hash vacío; el resto son `#/<id>`.
const ROUTES = new Set([...TABS.map((t) => t.id), ...GESTION_IDS, 'admin']);

// Enrutado por hash: cada sección tiene su URL (`#/creditos`), el botón "atrás"
// del navegador/celular funciona, y se pueden compartir enlaces a una sección.
// Hash (no History API) para no necesitar rewrites en Vercel y no romper el
// flujo de invitación por `?token=`.
function useHashRoute(fallback) {
  const parse = () => {
    const r = window.location.hash.replace(/^#\/?/, '');
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

  const quickCaptureEnabled = data.settings?.quick_capture_enabled !== false;
  const navTabs = TABS.filter((t) => !(t.requiresQuickCapture && !quickCaptureEnabled));
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
          <div>
            <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, color: T.ink }}>{data.householdName}</p>
            <p style={{ color: T.inkSoft, fontSize: 12.5 }}>{data.members.length} integrantes · {currency}</p>
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
          {tab === 'rapido' && quickCaptureEnabled && <QuickCapture data={data} actions={actions} setModal={setModal} />}
          {tab === 'movimientos' && <Movimientos data={data} actions={actions} visibleTransactions={visibleTransactions} setModal={setModal} />}
          {tab === 'gestion' && <Gestion setTab={setTab} />}
          {tab === 'creditos' && <Creditos data={data} actions={actions} setModal={setModal} />}
          {tab === 'objetivos' && <Objetivos data={data} actions={actions} setModal={setModal} />}
          {tab === 'presupuestos' && <Presupuestos data={data} actions={actions} setModal={setModal} />}
          {tab === 'conciliacion' && <Conciliacion data={data} actions={actions} />}
          {tab === 'cuentas' && <Cuentas data={data} actions={actions} setModal={setModal} />}
          {tab === 'ajustes' && <Ajustes data={data} update={update} actions={actions} setModal={setModal} setTab={setTab} />}
          {tab === 'admin' && data.isPlatformAdmin && <AdminPanel data={data} actions={actions} />}
        </PullToRefresh>
      </div>

      {/* Nav inferior */}
      <div className="fixed bottom-0 left-0 right-0 z-20" style={{ background: T.surface, borderTop: `1px solid ${T.border}` }}>
        <div className="flex justify-around px-2 py-2">
          {navTabs.map((tItem) => {
            const Icon = tItem.icon;
            const active = tItem.id === 'gestion' ? inGestion : tab === tItem.id;
            return (
              <button key={tItem.id} onClick={() => setTab(tItem.id)} className="flex flex-col items-center gap-0.5 px-2 py-1" style={{ minWidth: 56, minHeight: TAP_MIN }}>
                <Icon size={20} color={active ? T.teal : T.inkSoft} />
                <span style={{ fontSize: 10.5, color: active ? T.teal : T.inkSoft, fontFamily: FONT_BODY, fontWeight: active ? 600 : 400 }}>{tItem.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Botón flotante agregar movimiento */}
      <button onClick={() => setModal({ type: 'transaction' })}
        className="fixed z-20 rounded-full flex items-center justify-center shadow-lg"
        style={{ right: 20, bottom: 92, width: 56, height: 56, background: T.coral }}>
        <Plus color="#fff" size={26} />
      </button>

      {modal?.type === 'transaction' && <TransactionModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'editTransaction' && <EditTransactionModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'history' && <HistoryModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'goal' && <GoalModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'editGoal' && <EditGoalModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'withdrawGoal' && <WithdrawGoalModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'invite' && <InviteModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'account' && <AccountModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'budget' && <BudgetModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'vote' && <VoteModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'contribute' && <ContributeModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'category' && <CategoryModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'notifications' && <NotificationsPanel data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'credit' && <CreditModal data={data} actions={actions} onClose={() => setModal(null)} onCreated={modal.onCreated} />}
      {modal?.type === 'extraPayment' && <ExtraPaymentModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
      {modal?.type === 'payInstallment' && <PayInstallmentModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
      {modal?.type === 'editCredit' && <EditCreditModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
      {modal?.type === 'creditInsurance' && <CreditInsuranceModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
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
function Gestion({ setTab }) {
  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-1">Gestión</p>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Todas las herramientas para administrar las finanzas del hogar a fondo. Toca una para abrirla.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {GESTION_SECTIONS.map((s) => {
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




