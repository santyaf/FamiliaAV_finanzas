import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Home, List, Target, PiggyBank, Users, Settings, ArrowLeftRight, Wallet,
  TrendingUp, TrendingDown, X, Check, AlertTriangle, Star, Repeat, Calendar,
  Trash2, Pencil, ChevronRight, Plus, DollarSign, Landmark, Sparkles, ArrowRight,
  MessageCircle, Camera, Loader2, Image as ImageIcon, Info, LogOut, QrCode, Copy, UserPlus, History, CreditCard, Percent, ShieldCheck,
  ShieldAlert, ToggleLeft, ToggleRight, Bot, Bell,
  Briefcase, Receipt, Utensils, Car, HeartPulse, GraduationCap, Film, Shirt, Lightbulb, Minus, Tag,
  Eye, EyeOff, ExternalLink, MoreHorizontal, ThumbsUp, ThumbsDown, Users2,
  BellRing, BellOff, Clock, LayoutGrid, ChevronLeft
} from 'lucide-react';
import { supabase } from './lib/supabaseClient';
import * as db from './lib/db';
import { annualToMonthlyRate } from './lib/amortization';
import {
  todayISO, monthKey, thisMonthKey, daysUntil, getNextOccurrence, occurrencesInMonth,
  computeIncomeShares, computeBalances, simplifyDebts, goalPriorityScore,
} from './lib/finance';
import { formatMoney, formatDate } from './lib/format';
import { buildNotificationCandidates } from './lib/notifications';
import {
  T, FONT_DISPLAY, FONT_BODY, FONT_MONO, GOOGLE_FONTS_IMPORT, TAP_MIN,
  CURRENCIES, DAY_LABELS, PRIORITY_LABEL, inputStyle,
} from './ui/theme';
import {
  CATEGORY_ICON_OPTIONS, CategoryIcon,
  Modal, Field, PrimaryButton, GhostButton, IconButton, Card, ProgressBar, MemberChip, EmptyState,
} from './ui/primitives';
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

/* ---------------------------------------------------------------------- */
/* UTILIDADES                                                              */
/* ---------------------------------------------------------------------- */
// Tokens de diseño y constantes → ./ui/theme
// Componentes de UI genéricos (Modal, Field, Card, botones…) → ./ui/primitives
// formatMoney / formatDate → ./lib/format
// Cálculo puro (balances, deudas, amortización, alertas) → ./lib/{finance,amortization,notifications}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
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

function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function save() {
    setError('');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (password !== passwordConfirm) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    try {
      await db.updatePassword(password);
      window.history.replaceState({}, '', window.location.pathname);
      onDone();
    } catch (e) {
      setError(e.message || 'No se pudo actualizar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Card>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-1">Nueva contraseña</p>
        <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Elige tu nueva contraseña para continuar.</p>
        <PasswordField label="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        <PasswordField label="Confirmar contraseña" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••" />
        {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
        <PrimaryButton full onClick={save}>{loading ? 'Guardando…' : 'Guardar nueva contraseña'}</PrimaryButton>
      </Card>
    </AuthShell>
  );
}

function LoadingScreen() {
  return (
    <div style={{ background: T.bg, minHeight: '100vh' }} className="flex items-center justify-center">
      <style>{`${GOOGLE_FONTS_IMPORT}`}</style>
      <p style={{ fontFamily: FONT_BODY, color: T.inkSoft }}>Cargando…</p>
    </div>
  );
}

function AuthShell({ children }) {
  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: FONT_BODY }} className="flex flex-col items-center px-5 py-10">
      <style>{`${GOOGLE_FONTS_IMPORT}`}</style>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          <div style={{ width: 40, height: 40, borderRadius: 12, background: T.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wallet size={22} color="#fff" />
          </div>
          <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, color: T.ink }}>Finanzas del Hogar</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div style={{ position: 'relative' }}>
        <input
          style={{ ...inputStyle, paddingRight: 44 }}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="current-password"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="flex items-center justify-center"
          style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38 }}
        >
          {visible ? <EyeOff size={17} color={T.inkSoft} /> : <Eye size={17} color={T.inkSoft} />}
        </button>
      </div>
    </Field>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState('login'); // login | signup | forgot
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(''); setNotice(''); setLoading(true);
    try {
      if (mode === 'signup') {
        if (!fullName.trim()) throw new Error('Ingresa tu nombre.');
        if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
        if (password !== passwordConfirm) throw new Error('Las contraseñas no coinciden.');
        await db.signUp(email.trim(), password, fullName.trim());
        setNotice('Cuenta creada. Si tu proyecto pide confirmación por correo, revisa tu bandeja y luego inicia sesión.');
        setMode('login');
      } else if (mode === 'forgot') {
        if (!email.trim()) throw new Error('Ingresa tu correo.');
        await db.resetPasswordForEmail(email.trim());
        setNotice('Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo.');
      } else {
        await db.signIn(email.trim(), password);
      }
    } catch (e) {
      setError(e.message || 'Ocurrió un error.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <Card>
        {mode !== 'forgot' && (
          <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
            <button onClick={() => setMode('login')} className="flex-1 rounded-lg py-2" style={{ background: mode === 'login' ? T.surface : 'transparent', border: mode === 'login' ? `1px solid ${T.border}` : 'none' }}>
              <span style={{ fontSize: 13, fontFamily: FONT_BODY, fontWeight: 600, color: T.ink }}>Iniciar sesión</span>
            </button>
            <button onClick={() => setMode('signup')} className="flex-1 rounded-lg py-2" style={{ background: mode === 'signup' ? T.surface : 'transparent', border: mode === 'signup' ? `1px solid ${T.border}` : 'none' }}>
              <span style={{ fontSize: 13, fontFamily: FONT_BODY, fontWeight: 600, color: T.ink }}>Crear cuenta</span>
            </button>
          </div>
        )}
        {mode === 'forgot' && (
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-1">Recuperar cuenta</p>
        )}
        {mode === 'forgot' && (
          <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Te enviaremos un enlace a tu correo para crear una nueva contraseña.</p>
        )}
        {mode === 'signup' && (
          <Field label="Nombre">
            <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Tu nombre" />
          </Field>
        )}
        <Field label="Correo">
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" />
        </Field>
        {mode !== 'forgot' && (
          <PasswordField label="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        )}
        {mode === 'signup' && (
          <PasswordField label="Confirmar contraseña" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••" />
        )}
        {mode === 'login' && (
          <button onClick={() => { setMode('forgot'); setError(''); setNotice(''); }} className="mb-4 block">
            <span style={{ fontSize: 12.5, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>¿Olvidaste tu contraseña?</span>
          </button>
        )}
        {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
        {notice && <p style={{ color: T.teal, fontSize: 12.5 }} className="mb-3">{notice}</p>}
        <PrimaryButton full onClick={submit}>
          {loading ? 'Un momento…' : mode === 'signup' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar enlace' : 'Entrar'}
        </PrimaryButton>
        {mode !== 'forgot' && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div style={{ flex: 1, height: 1, background: T.border }} />
              <span style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>o</span>
              <div style={{ flex: 1, height: 1, background: T.border }} />
            </div>
            <GhostButton full onClick={() => db.signInWithGoogle().catch((e) => setError(e.message))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.4l-6.3-5.3C29.4 35 26.8 36 24 36c-5.4 0-9.9-3.4-11.5-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.3 5.3C39.9 37 44 31.5 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>
              <span style={{ fontSize: 14, fontFamily: FONT_BODY, fontWeight: 500 }}>Continuar con Google</span>
            </GhostButton>
          </>
        )}
        {mode === 'forgot' && (
          <button onClick={() => { setMode('login'); setError(''); setNotice(''); }} className="mt-3 block mx-auto">
            <span style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Volver a iniciar sesión</span>
          </button>
        )}
      </Card>

    </AuthShell>
  );
}

function HouseholdSetup({ userId, onReady, joinError }) {
  const [mode, setMode] = useState('create');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [code, setCode] = useState('');
  const [error, setError] = useState(joinError || '');
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setLoading(true); setError('');
    try {
      await db.createHousehold(userId, name.trim(), currency);
      onReady(await db.getMyHousehold(userId));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  async function join() {
    if (!code.trim()) return;
    setLoading(true); setError('');
    try {
      await db.redeemInvite(code.trim(), userId);
      onReady(await db.getMyHousehold(userId));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  return (
    <AuthShell>
      <Card>
        <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
          <button onClick={() => setMode('create')} className="flex-1 rounded-lg py-2" style={{ background: mode === 'create' ? T.surface : 'transparent' }}>
            <span style={{ fontSize: 13, fontFamily: FONT_BODY, fontWeight: 600, color: T.ink }}>Crear hogar</span>
          </button>
          <button onClick={() => setMode('join')} className="flex-1 rounded-lg py-2" style={{ background: mode === 'join' ? T.surface : 'transparent' }}>
            <span style={{ fontSize: 13, fontFamily: FONT_BODY, fontWeight: 600, color: T.ink }}>Unirme con código</span>
          </button>
        </div>
        {mode === 'create' ? (
          <>
            <Field label="Nombre del hogar">
              <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Casa García" />
            </Field>
            <Field label="Moneda principal">
              <select style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>
            {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
            <PrimaryButton full onClick={create}>{loading ? 'Creando…' : 'Crear hogar'}</PrimaryButton>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: T.inkSoft }} className="mb-3">Pide a un integrante que te comparta el código o el QR desde Ajustes → Invitar.</p>
            <Field label="Código de invitación">
              <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Pega el código aquí" />
            </Field>
            {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
            <PrimaryButton full onClick={join}>{loading ? 'Uniendo…' : 'Unirme al hogar'}</PrimaryButton>
          </>
        )}
      </Card>
    </AuthShell>
  );
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

/* ---------------------------------------------------------------------- */
/* DONUT (SVG puro — antes se usaba recharts, ~250 KB de bundle para este  */
/* único gráfico; ahora es un componente de ~25 líneas sin dependencias).  */
/* ---------------------------------------------------------------------- */
function DonutChart({ data, colors, size = 168, thickness = 30 }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gastos por categoría" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={T.border} strokeWidth={thickness} opacity={0.35} />
      <g transform={`rotate(-90 ${c} ${c})`}>
        {total > 0 && data.map((d, i) => {
          const frac = (d.value || 0) / total;
          const seg = (
            <circle key={i} cx={c} cy={c} r={r} fill="none"
              stroke={colors[i % colors.length]} strokeWidth={thickness}
              strokeDasharray={`${Math.max(frac * circ - 2, 0)} ${circ}`}
              strokeDashoffset={-acc * circ} strokeLinecap="butt" />
          );
          acc += frac;
          return seg;
        })}
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* DASHBOARD                                                               */
/* ---------------------------------------------------------------------- */
function Dashboard({ data, update, actions, visibleTransactions, visibleMemberId, setModal, setTab }) {
  const mKey = thisMonthKey();
  const currency = data.currency;
  const myId = actions.userId;

  // división entre lo compartido/familiar (todos lo ven) y lo personal (solo yo)
  function splitFamilyPersonal(list) {
    const family = [], personal = [];
    list.forEach((t) => {
      if (t.type === 'settlement' || t.type === 'transfer') return;
      const account = data.accounts.find((a) => a.id === t.accountId);
      const isFamily = t.isShared || account?.type === 'shared';
      if (isFamily) family.push(t);
      else if (t.memberId === myId) personal.push(t);
    });
    return { family, personal };
  }
  function monthTotals(list) {
    let income = 0, expense = 0;
    list.forEach((t) => {
      const occ = occurrencesInMonth(t, mKey);
      if (!occ) return;
      if (t.type === 'income') income += t.amount * occ; else expense += t.amount * occ;
    });
    return { income, expense, balance: income - expense };
  }
  const { family, personal } = splitFamilyPersonal(data.transactions);
  const familyTotals = monthTotals(family);
  const personalTotals = monthTotals(personal);

  // las transferencias entre integrantes (no ligadas a un objetivo) no son ingreso/gasto,
  // pero sí mueven plata de/hacia mi bolsillo personal — se reflejan aparte, con transparencia
  let personalTransferNet = 0;
  data.transactions.forEach((t) => {
    if (t.type !== 'transfer' || t.goalId) return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    if (t.memberId === myId) personalTransferNet -= t.amount * occ;
    if (t.toMemberId === myId) personalTransferNet += t.amount * occ;
  });
  personalTotals.transferNet = personalTransferNet;
  personalTotals.balance += personalTransferNet;

  let income = 0, expense = 0;
  visibleTransactions.forEach((t) => {
    if (t.type === 'settlement' || t.type === 'transfer') return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    if (t.type === 'income') income += t.amount * occ;
    else expense += t.amount * occ;
  });
  // en vista Individual, las transferencias hacia/desde ese integrante sí deben
  // afectar su balance (en Unificado se excluyen porque entre dos integrantes
  // del mismo hogar el efecto neto es cero para el hogar completo)
  let transferNetForView = 0;
  if (data.viewMode === 'individual' && visibleMemberId) {
    data.transactions.forEach((t) => {
      if (t.type !== 'transfer' || t.goalId) return;
      const occ = occurrencesInMonth(t, mKey);
      if (!occ) return;
      if (t.memberId === visibleMemberId) transferNetForView -= t.amount * occ;
      if (t.toMemberId === visibleMemberId) transferNetForView += t.amount * occ;
    });
  }
  const balance = income - expense + transferNetForView;

  const byCategory = {};
  visibleTransactions.forEach((t) => {
    if (t.type !== 'expense') return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount * occ;
  });
  const catData = Object.entries(byCategory).map(([id, val]) => {
    const cat = data.categories.find((c) => c.id === id);
    return { name: cat?.name || 'Otro', value: val, icon: cat?.icon };
  }).sort((a, b) => b.value - a.value);
  const pieColors = [T.teal, T.coral, T.gold, '#5B7FA6', '#8E5B9F', '#4A9B6E', '#B5533C'];

  // próximos pagos recurrentes (14 días)
  const upcoming = data.transactions
    .filter((t) => t.recurring && (data.viewMode === 'unified' || t.memberId === visibleMemberId))
    .map((t) => ({ ...t, next: getNextOccurrence(t) }))
    .filter((t) => daysUntil(t.next) >= 0 && daysUntil(t.next) <= 14)
    .sort((a, b) => a.next.localeCompare(b.next));

  // alertas de presupuesto
  const budgetAlerts = data.budgets.map((b) => {
    const spent = data.transactions
      .filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && occurrencesInMonth(t, mKey) && (b.scope === 'household' || t.memberId === b.scope))
      .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mKey), 0);
    return { ...b, spent, pct: b.limit ? (spent / b.limit) * 100 : 0 };
  }).filter((b) => b.pct >= 80);

  // top objetivo
  const topGoals = [...data.goals].sort((a, b) => goalPriorityScore(b) - goalPriorityScore(a)).slice(0, 2);

  return (
    <div className="pb-4">
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2 mb-2">
        Balance del mes — familiar (todos lo ven) y personal (solo tú)
      </p>
      <div className="flex flex-col gap-3 mb-4">
        <Card style={{ background: T.tealSoft, border: 'none' }}>
          <div className="flex items-center gap-1.5 mb-1"><Users size={14} color={T.teal} /><span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 600 }}>Familiar / compartido</span></div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, color: T.inkSoft }}>Ingresos {formatMoney(familyTotals.income, currency)} · Gastos {formatMoney(familyTotals.expense, currency)}</span>
            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 17, color: familyTotals.balance >= 0 ? T.teal : T.danger }}>{formatMoney(familyTotals.balance, currency)}</span>
          </div>
        </Card>
        <Card style={{ background: T.goldSoft, border: 'none' }}>
          <div className="flex items-center gap-1.5 mb-1"><Wallet size={14} color={T.gold} /><span style={{ fontSize: 12, color: T.gold, fontFamily: FONT_BODY, fontWeight: 600 }}>Mis finanzas personales</span></div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, color: T.inkSoft }}>
              Ingresos {formatMoney(personalTotals.income, currency)} · Gastos {formatMoney(personalTotals.expense, currency)}
              {personalTotals.transferNet !== 0 && ` · Transferencias ${personalTotals.transferNet > 0 ? '+' : ''}${formatMoney(personalTotals.transferNet, currency)}`}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 17, color: personalTotals.balance >= 0 ? T.teal : T.danger }}>{formatMoney(personalTotals.balance, currency)}</span>
          </div>
          <p style={{ fontSize: 10, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Solo tú puedes ver este bloque</p>
        </Card>
      </div>

      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Según la vista seleccionada arriba ({data.viewMode === 'unified' ? 'Unificado' : 'Individual'}):</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card style={{ background: T.tealSoft, border: 'none' }}>
          <div className="flex items-center gap-1.5 mb-1"><TrendingUp size={15} color={T.teal} /><span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY }}>Ingresos del mes</span></div>
          <p style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 20, color: T.ink }}>{formatMoney(income, currency)}</p>
        </Card>
        <Card style={{ background: T.coralSoft, border: 'none' }}>
          <div className="flex items-center gap-1.5 mb-1"><TrendingDown size={15} color={T.coral} /><span style={{ fontSize: 12, color: T.coral, fontFamily: FONT_BODY }}>Gastos del mes</span></div>
          <p style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 20, color: T.ink }}>{formatMoney(expense, currency)}</p>
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontFamily: FONT_BODY, color: T.inkSoft, fontSize: 13 }}>Balance de {data.viewMode === 'unified' ? 'el hogar' : 'este integrante'}</span>
          <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 22, color: balance >= 0 ? T.teal : T.danger }}>{formatMoney(balance, currency)}</span>
        </div>
        {transferNetForView !== 0 && (
          <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Incluye {transferNetForView > 0 ? '+' : ''}{formatMoney(transferNetForView, currency)} de transferencias entre integrantes</p>
        )}
      </Card>

      {budgetAlerts.length > 0 && (
        <Card style={{ marginBottom: 16, background: T.goldSoft, border: 'none' }}>
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} color={T.gold} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Presupuestos por vencer</span></div>
          {budgetAlerts.map((b) => {
            const cat = data.categories.find((c) => c.id === b.categoryId);
            return <p key={b.id} style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-0.5">
              <span className="inline-flex items-center gap-1"><CategoryIcon icon={cat?.icon} size={13} color={T.inkSoft} /> {cat?.name}</span>: usaste {Math.round(b.pct)}% ({formatMoney(b.spent, currency)} de {formatMoney(b.limit, currency)})
            </p>;
          })}
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div className="flex items-center gap-2 mb-3"><Calendar size={16} color={T.ink} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Próximos pagos recurrentes</span></div>
          {upcoming.map((t) => {
            const cat = data.categories.find((c) => c.id === t.categoryId);
            const d = daysUntil(t.next);
            return (
              <div key={t.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <CategoryIcon icon={cat?.icon} size={16} color={T.inkSoft} />
                  <div>
                    <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>{t.description || cat?.name}</p>
                    <p style={{ fontSize: 11.5, color: T.inkSoft }}>{d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días`} · {formatDate(t.next)}</p>
                  </div>
                </div>
                <span style={{ fontFamily: FONT_MONO, fontSize: 13.5, color: t.type === 'income' ? T.teal : T.coral }}>{t.type === 'income' ? '+' : '-'}{formatMoney(t.amount, currency)}</span>
              </div>
            );
          })}
        </Card>
      )}

      {catData.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }} className="mb-2">Gastos por categoría</p>
          <div style={{ padding: '4px 0 10px' }}>
            <DonutChart data={catData} colors={pieColors} />
          </div>
          <div className="flex flex-col gap-1 mt-1">
            {catData.slice(0, 5).map((c, i) => (
              <div key={c.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div style={{ width: 8, height: 8, borderRadius: 4, background: pieColors[i % pieColors.length] }} /><span className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: T.inkSoft }}><CategoryIcon icon={c.icon} size={12} color={T.inkSoft} /> {c.name}</span></div>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink }}>{formatMoney(c.value, currency)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {topGoals.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Sparkles size={16} color={T.gold} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Objetivos prioritarios</span></div>
            <button onClick={() => setTab('objetivos')}><ChevronRight size={18} color={T.inkSoft} /></button>
          </div>
          {topGoals.map((g) => (
            <div key={g.id} className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{g.name}</span>
                <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_MONO }}>{formatMoney(g.currentAmount, currency)} / {formatMoney(g.targetAmount, currency)}</span>
              </div>
              <ProgressBar value={(g.currentAmount / g.targetAmount) * 100} color={T.gold} />
            </div>
          ))}
        </Card>
      )}

      {visibleTransactions.length === 0 && (
        <EmptyState icon={<Wallet size={40} color={T.teal} />} title="Aún no hay movimientos" subtitle="Toca el botón + para registrar tu primer ingreso o gasto." />
      )}
    </div>
  );
}



function UvrCard({ actions }) {
  const [uvr, setUvr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualDate, setManualDate] = useState(todayISO());
  const [manualValue, setManualValue] = useState('');
  const [saved, setSaved] = useState(false);

  async function fetchUvr() {
    setLoading(true);
    try { setUvr(await actions.getLatestUvr()); } finally { setLoading(false); }
  }
  useEffect(() => { fetchUvr(); }, []);

  async function saveManual() {
    const v = parseFloat(manualValue);
    if (!v || !manualDate) return;
    await actions.saveManualUvr(manualDate, v);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    fetchUvr();
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }} className="mb-2">Valor UVR</p>
      {loading && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Consultando…</p>}
      {uvr && <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Último valor {uvr.cached ? 'guardado' : 'consultado automáticamente'}: <b style={{ color: T.ink }}>${uvr.value.toLocaleString('es-CO')}</b> ({formatDate(uvr.date)})</p>}
      {!uvr && !loading && <p style={{ fontSize: 12.5, color: T.danger }} className="mb-3">No se pudo consultar el valor automáticamente. Consúltalo en la fuente oficial e ingrésalo manualmente:</p>}
      <a href="https://suameca.banrep.gov.co/estadisticas-economicas/informacionSerie/100005/unidad_valor_real_uvr" target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 mb-3">
        <ExternalLink size={12} color={T.teal} />
        <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Consultar en el Banco de la República</span>
      </a>
      <div className="flex gap-2">
        <input style={{ ...inputStyle, flex: 1 }} type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
        <input style={{ ...inputStyle, flex: 1 }} type="number" placeholder="Valor UVR" value={manualValue} onChange={(e) => setManualValue(e.target.value)} />
      </div>
      <GhostButton full onClick={saveManual} style={{ marginTop: 10 }}>{saved ? '¡Guardado!' : 'Guardar valor manual'}</GhostButton>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* AJUSTES                                                                */
/* ---------------------------------------------------------------------- */
function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const [showIosSteps, setShowIosSteps] = useState(false);

  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(window.navigator.userAgent);

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onInstalled() { setInstalled(true); setDeferredPrompt(null); }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferredPrompt && !isIos) return null; // otro navegador de escritorio sin soporte — no mostramos nada

  return (
    <Card style={{ marginBottom: 14, background: T.tealSoft, border: 'none' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Instalar la app</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Agrégala a tu pantalla de inicio para usarla como una app nativa.</p>
        </div>
        {deferredPrompt ? (
          <PrimaryButton onClick={async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); }} style={{ padding: '8px 14px', fontSize: 12.5, flexShrink: 0 }}>
            Instalar
          </PrimaryButton>
        ) : (
          <GhostButton onClick={() => setShowIosSteps((v) => !v)} style={{ padding: '8px 14px', fontSize: 12.5, flexShrink: 0 }}>
            Cómo
          </GhostButton>
        )}
      </div>
      {isIos && showIosSteps && (
        <div className="mt-3 pt-3" style={{ borderTop: `1px solid rgba(0,0,0,0.08)` }}>
          {!isSafari && (
            <p style={{ fontSize: 11.5, color: T.danger, fontFamily: FONT_BODY }} className="mb-2">Abre este enlace en <b>Safari</b> — desde otros navegadores de iPhone no se puede instalar.</p>
          )}
          <ol className="flex flex-col gap-1.5">
            <li style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>1. Toca el ícono de <b>Compartir</b> (el cuadrado con la flecha hacia arriba)</li>
            <li style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>2. Baja y elige <b>"Agregar a inicio"</b></li>
            <li style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>3. Toca <b>Agregar</b> arriba a la derecha</li>
          </ol>
        </div>
      )}
    </Card>
  );
}

function RemindersCard({ actions, setModal }) {
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [subscribing, setSubscribing] = useState(false);
  const [schedules, setSchedules] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    setSchedules(await actions.loadReminderSchedules());
  }
  useEffect(() => { refresh(); }, []);

  async function enablePush() {
    setSubscribing(true); setError('');
    try {
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
        throw new Error('Este navegador no soporta notificaciones push.');
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') throw new Error('No diste permiso para las notificaciones.');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
        });
      }
      await actions.savePushSubscription(sub.toJSON());
    } catch (e) {
      setError(e.message || 'No se pudo activar las notificaciones.');
    } finally {
      setSubscribing(false);
    }
  }

  async function toggleSchedule(s) {
    await actions.updateReminderSchedule(s.id, { enabled: !s.enabled });
    await refresh();
  }
  async function removeSchedule(id) {
    await actions.removeReminderSchedule(id);
    await refresh();
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2 mb-1">
        <BellRing size={16} color={T.ink} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Recordatorios</p>
      </div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Notificaciones push para que no se te olvide registrar tus movimientos — funcionan aunque tengas la app cerrada.</p>

      {permission !== 'granted' && (
        <GhostButton full onClick={enablePush} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <BellRing size={14} /> {subscribing ? 'Activando…' : 'Activar notificaciones push en este dispositivo'}
        </GhostButton>
      )}
      {permission === 'denied' && (
        <p style={{ fontSize: 11, color: T.danger, fontFamily: FONT_BODY }} className="mb-3">Bloqueaste las notificaciones para este sitio — actívalas desde la configuración del navegador para poder usar recordatorios.</p>
      )}
      {error && <p style={{ fontSize: 11.5, color: T.danger, fontFamily: FONT_BODY }} className="mb-3">{error}</p>}

      {schedules?.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-xl p-2.5 mb-2" style={{ background: s.enabled ? T.tealSoft : T.bg }}>
          <div>
            <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{s.label}</p>
            <p style={{ fontSize: 10.5, color: T.inkSoft }}>
              {s.timeOfDay} · {s.daysOfWeek.length === 7 ? 'Todos los días' : s.daysOfWeek.map((d) => DAY_LABELS[d]).join(' ')}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton icon={s.enabled ? BellRing : BellOff} size={16} onClick={() => toggleSchedule(s)} color={s.enabled ? T.teal : T.inkSoft} label={s.enabled ? 'Desactivar' : 'Activar'} />
            <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeSchedule(s.id)} confirmMessage="¿Eliminar este recordatorio?" label="Eliminar recordatorio" />
          </div>
        </div>
      ))}

      <GhostButton full onClick={() => setModal({ type: 'reminder', onDone: refresh })} style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> Nuevo recordatorio
      </GhostButton>
    </Card>
  );
}

function ReminderModal({ actions, onClose, onDone }) {
  const [label, setLabel] = useState('Registrar movimientos');
  const [time, setTime] = useState('20:00');
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function toggleDay(d) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  async function save() {
    if (!days.length) { setError('Elige al menos un día.'); return; }
    setSaving(true); setError('');
    try {
      await actions.addReminderSchedule({ label: label.trim() || 'Registrar movimientos', timeOfDay: time, timezone, daysOfWeek: days });
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo crear el recordatorio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nuevo recordatorio" onClose={onClose}>
      <Field label="Mensaje">
        <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. Registrar movimientos" />
      </Field>
      <Field label="Hora (tu zona horaria detectada es esta)">
        <input style={inputStyle} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>
      <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Zona horaria: <span style={{ fontFamily: FONT_MONO }}>{timezone}</span></p>
      <Field label="Días">
        <div className="flex gap-1.5">
          {DAY_LABELS.map((label, i) => (
            <button key={i} type="button" onClick={() => toggleDay(i)}
              className="flex items-center justify-center rounded-full"
              style={{ width: 36, height: 36, background: days.includes(i) ? T.teal : T.bg, border: `1px solid ${days.includes(i) ? T.teal : T.border}` }}>
              <span style={{ fontSize: 12.5, color: days.includes(i) ? '#fff' : T.inkSoft, fontWeight: 600 }}>{label}</span>
            </button>
          ))}
        </div>
      </Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Crear recordatorio'}</PrimaryButton>
    </Modal>
  );
}

function Ajustes({ data, update, actions, setModal, setTab }) {
  function removeCategory(id) {
    actions.removeCategory(id);
  }
  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-3">Ajustes</p>

      <InstallAppCard />
      <RemindersCard actions={actions} setModal={setModal} />

      <Card style={{ marginBottom: 14 }}>
        <Field label="Nombre del hogar">
          <input style={inputStyle} value={data.householdName} onChange={(e) => update({ householdName: e.target.value })} />
        </Field>
        <Field label="Moneda">
          <select style={inputStyle} value={data.currency} onChange={(e) => update({ currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </Field>
      </Card>

      <UvrCard actions={actions} />

      <Card style={{ marginBottom: 14 }}>
        <div className="flex items-center justify-between mb-3">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Integrantes</p>
          <button onClick={() => setModal({ type: 'invite' })} className="flex items-center gap-1 rounded-full px-3 py-1.5" style={{ background: T.teal }}>
            <QrCode size={14} color="#fff" /><span style={{ fontSize: 12, color: '#fff', fontFamily: FONT_BODY, fontWeight: 500 }}>Invitar</span>
          </button>
        </div>
        {data.members.map((m) => (
          <div key={m.id} className="flex items-center justify-between mb-2">
            <MemberChip member={m} />
            {m.role === 'admin' && <span style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Admin</span>}
          </div>
        ))}
        <GhostButton full onClick={() => { if (confirm('¿Salir de este hogar? Dejarás de ver sus datos en este dispositivo.')) actions.leaveHousehold(); }} style={{ marginTop: 10, fontSize: 12.5 }}>
          Salir de este hogar
        </GhostButton>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Categorías</p>
          <IconButton icon={Plus} onClick={() => setModal({ type: 'category' })} color={T.teal} label="Nueva categoría" />
        </div>
        <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-2">Ingresos</p>
        {data.categories.filter((c) => c.type === 'income').map((c) => (
          <div key={c.id} className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-2" style={{ fontSize: 13, color: T.ink }}><CategoryIcon icon={c.icon} size={15} /> {c.name}</span>
            <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeCategory(c.id)} confirmMessage={`¿Eliminar la categoría "${c.name}"?`} label="Eliminar categoría" />
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-2 mt-3">Gastos</p>
        {data.categories.filter((c) => c.type === 'expense').map((c) => (
          <div key={c.id} className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-2" style={{ fontSize: 13, color: T.ink }}><CategoryIcon icon={c.icon} size={15} /> {c.name}</span>
            <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeCategory(c.id)} confirmMessage={`¿Eliminar la categoría "${c.name}"?`} label="Eliminar categoría" />
          </div>
        ))}
      </Card>

      {data.isPlatformAdmin && (
        <Card style={{ marginTop: 14 }}>
          <button onClick={() => setTab('admin')} className="flex items-center justify-between w-full active:opacity-60" style={{ minHeight: 40 }}>
            <span className="flex items-center gap-2" style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>
              <ShieldAlert size={16} color={T.coral} /> Administración de la plataforma
            </span>
            <ChevronRight size={18} color={T.inkSoft} />
          </button>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">
            Ajustes globales que afectan a todos los hogares (Registro rápido, proveedor de IA, notificaciones, superusuarios).
          </p>
        </Card>
      )}
    </div>
  );
}

function InviteModal({ data, actions, onClose }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true); setError('');
    try {
      const inv = await actions.createInvite();
      setInvite(inv);
    } catch (e) {
      setError(e.message || 'No se pudo crear la invitación.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { generate(); }, []);

  const joinUrl = invite ? `${window.location.origin}${window.location.pathname}?token=${invite.token}` : '';
  const qrUrl = invite ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(joinUrl)}` : '';

  function copyLink() {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal title="Invitar a un integrante" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Pide a la persona que escanee este código con la cámara de su celular, o comparte el enlace directamente. La invitación vence en 3 días.
      </p>
      {loading && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Generando invitación…</p>}
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      {invite && (
        <>
          <div className="flex justify-center mb-4">
            <img src={qrUrl} alt="Código QR de invitación" width={200} height={200} className="rounded-xl" style={{ border: `1px solid ${T.border}` }} />
          </div>
          <div className="rounded-xl p-3 mb-4 flex items-center justify-between gap-2" style={{ background: T.bg }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: T.inkSoft, wordBreak: 'break-all' }}>{joinUrl}</p>
          </div>
          <div className="flex gap-2">
            <GhostButton full onClick={copyLink} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Copy size={14} /> {copied ? '¡Copiado!' : 'Copiar enlace'}
            </GhostButton>
            <PrimaryButton full onClick={generate} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <UserPlus size={14} /> Nueva invitación
            </PrimaryButton>
          </div>
        </>
      )}
    </Modal>
  );
}

function CategoryModal({ data, actions, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [icon, setIcon] = useState(CATEGORY_ICON_OPTIONS[0]);
  async function save() {
    if (!name.trim()) return;
    await actions.addCategory({ name: name.trim(), type, icon });
    onClose();
  }
  return (
    <Modal title="Nueva categoría" onClose={onClose}>
      <Field label="Nombre">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Mascotas" />
      </Field>
      <Field label="Tipo">
        <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
        </select>
      </Field>
      <Field label="Ícono">
        <div className="grid grid-cols-6 gap-2">
          {CATEGORY_ICON_OPTIONS.map((key) => (
            <button key={key} type="button" onClick={() => setIcon(key)}
              className="flex items-center justify-center rounded-xl"
              style={{ width: TAP_MIN, height: TAP_MIN, background: icon === key ? T.tealSoft : T.bg, border: `1.5px solid ${icon === key ? T.teal : T.border}` }}>
              <CategoryIcon icon={key} size={18} color={icon === key ? T.teal : T.inkSoft} />
            </button>
          ))}
        </div>
      </Field>
      <PrimaryButton full onClick={save}>Crear categoría</PrimaryButton>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* PANEL DE ADMINISTRACIÓN (superusuario)                                */
/* ---------------------------------------------------------------------- */
const AI_PROVIDERS = [
  { id: 'none', label: 'Ninguna (Registro rápido desactivado)', defaultModel: null },
  { id: 'claude', label: 'Claude (Anthropic)', defaultModel: 'claude-sonnet-4-6' },
  { id: 'openai', label: 'ChatGPT (OpenAI)', defaultModel: 'gpt-4o-mini' },
  { id: 'gemini', label: 'Gemini (Google)', defaultModel: 'gemini-3.6-flash' },
];
const NOTIFICATION_TYPE_LABELS = {
  notif_budget_projection_enabled: 'Proyección temprana de presupuesto',
  notif_goal_pace_enabled: 'Ritmo de objetivos',
  notif_extra_income_enabled: 'Ingresos extraordinarios',
  notif_credit_due_enabled: 'Cuotas de crédito por vencer',
  notif_surplus_opportunity_enabled: 'Excedente familiar del mes',
};

function AdminPanel({ data, actions }) {
  const [households, setHouseholds] = useState(null);
  const [householdsError, setHouseholdsError] = useState('');
  const [admins, setAdmins] = useState(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshAll() {
    try {
      setHouseholds(await actions.listAllHouseholdsAdmin());
    } catch (e) {
      setHouseholdsError(e.message || 'No se pudo cargar la lista de hogares.');
    }
    setAdmins(await actions.listPlatformAdmins());
  }
  useEffect(() => { refreshAll(); }, []);

  const settings = data.settings;
  const quickCaptureEnabled = settings.quick_capture_enabled !== false;
  const currentProvider = quickCaptureEnabled ? (settings.ai_provider || 'claude') : 'none';

  async function toggleQuickCapture() {
    const next = !quickCaptureEnabled;
    await actions.updateSetting('quick_capture_enabled', next);
    if (!next) await actions.updateSetting('ai_provider', 'none');
  }
  async function changeProvider(providerId) {
    const provider = AI_PROVIDERS.find((p) => p.id === providerId);
    await actions.updateSetting('ai_provider', providerId);
    if (provider.defaultModel) await actions.updateSetting('ai_model', provider.defaultModel);
    await actions.updateSetting('quick_capture_enabled', providerId !== 'none');
  }

  async function addAdmin() {
    if (!newAdminEmail.trim()) return;
    setBusy(true); setError('');
    try {
      await actions.promoteToAdmin(newAdminEmail.trim());
      setNewAdminEmail('');
      await refreshAll();
    } catch (e) {
      setError(e.message || 'No se pudo promover a este usuario.');
    } finally {
      setBusy(false);
    }
  }
  async function removeAdmin(userId) {
    if (!confirm('¿Quitar permisos de superusuario a esta persona?')) return;
    await actions.removeAdmin(userId);
    await refreshAll();
  }

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert size={18} color={T.coral} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Administración</p>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Panel de superusuario — estos cambios afectan a toda la plataforma, no solo a tu hogar.
      </p>

      <Card style={{ marginBottom: 14 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Registro rápido con IA</p>
        <button onClick={toggleQuickCapture} className="flex items-center justify-between w-full rounded-xl p-3" style={{ background: T.bg }}>
          <span style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>{quickCaptureEnabled ? 'Activado para todo el mundo' : 'Desactivado para todo el mundo'}</span>
          {quickCaptureEnabled ? <ToggleRight size={26} color={T.teal} /> : <ToggleLeft size={26} color={T.inkSoft} />}
        </button>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div className="flex items-center gap-2 mb-3">
          <Bot size={15} color={T.ink} />
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Proveedor de IA</p>
        </div>
        <div className="flex flex-col gap-2">
          {AI_PROVIDERS.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-xl p-3" style={{ background: currentProvider === p.id ? T.tealSoft : T.bg, border: `1px solid ${currentProvider === p.id ? T.teal : T.border}` }}>
              <input type="radio" checked={currentProvider === p.id} onChange={() => changeProvider(p.id)} />
              <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{p.label}</span>
            </label>
          ))}
        </div>
        {currentProvider !== 'none' && (
          <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-3">
            Modelo actual: <span style={{ fontFamily: FONT_MONO }}>{settings.ai_model}</span>. Cada proveedor necesita su propia clave configurada en Vercel ({'\u00a0'}<span style={{ fontFamily: FONT_MONO }}>ANTHROPIC_API_KEY</span> / <span style={{ fontFamily: FONT_MONO }}>OPENAI_API_KEY</span> / <span style={{ fontFamily: FONT_MONO }}>GOOGLE_API_KEY</span>).
          </p>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-1">Tipos de notificación</p>
        <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Actívalas o desactívalas para toda la plataforma. Cada usuario también puede apagarlas para sí mismo desde su propia bandeja.</p>
        <div className="flex flex-col gap-2">
          {Object.entries(NOTIFICATION_TYPE_LABELS).map(([key, label]) => {
            const enabled = settings[key] !== false;
            return (
              <button key={key} onClick={() => actions.updateSetting(key, !enabled)} className="flex items-center justify-between rounded-xl p-3" style={{ background: T.bg }}>
                <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{label}</span>
                {enabled ? <ToggleRight size={22} color={T.teal} /> : <ToggleLeft size={22} color={T.inkSoft} />}
              </button>
            );
          })}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Superusuarios</p>
        {admins?.map((a) => (
          <div key={a.userId} className="flex items-center justify-between mb-2">
            <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{a.name}</span>
            <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeAdmin(a.userId)} label="Quitar superusuario" />
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input style={{ ...inputStyle, flex: 1 }} type="email" placeholder="correo@ejemplo.com" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} />
          <button onClick={addAdmin} aria-label="Agregar superusuario" className="flex items-center justify-center active:scale-90 transition-transform" style={{ background: T.teal, borderRadius: 10, minWidth: TAP_MIN, height: TAP_MIN }}>
            <Plus color="#fff" size={18} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">La persona debe tener ya una cuenta creada en la app.</p>
        {error && <p style={{ color: T.danger, fontSize: 12 }} className="mt-2">{error}</p>}
      </Card>

      <Card>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Hogares en la plataforma {households ? `(${households.length})` : ''}</p>
        {householdsError && <p style={{ color: T.danger, fontSize: 12 }} className="mb-2">{householdsError}</p>}
        {!households && !householdsError && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Cargando…</p>}
        {households?.length === 0 && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Aún no hay hogares creados en la plataforma.</p>}
        {households?.map((h) => (
          <div key={h.id} className="mb-3 pb-3" style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="flex items-center justify-between">
              <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{h.name}</p>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.inkSoft }}>{h.memberCount} integrante{h.memberCount === 1 ? '' : 's'}</span>
            </div>
            <p style={{ fontSize: 10.5, color: T.inkSoft }}>{formatDate(h.createdAt.slice(0, 10))} · {h.currency}{h.memberNames ? ` · ${h.memberNames}` : ''}</p>
          </div>
        ))}
        <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">Solo se muestran metadatos — no el detalle financiero de cada hogar.</p>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* BANDEJA DE NOTIFICACIONES                                              */
/* ---------------------------------------------------------------------- */
const NOTIFICATION_ICONS = {
  budget_projection: { icon: AlertTriangle, color: T.gold, bg: T.goldSoft },
  goal_pace: { icon: Target, color: T.coral, bg: T.coralSoft },
  extra_income: { icon: TrendingUp, color: T.teal, bg: T.tealSoft },
  credit_due: { icon: Calendar, color: T.ink, bg: T.bg },
  surplus_opportunity: { icon: Sparkles, color: T.gold, bg: T.goldSoft },
};

function relativeDay(iso) {
  const d = daysUntil(iso.slice(0, 10)) * -1; // días desde que se creó (negativo hacia atrás con daysUntil)
  if (d <= 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  if (d < 7) return `Hace ${d} días`;
  return formatDate(iso.slice(0, 10));
}

function NotificationsPanel({ data, actions, onClose }) {
  const list = data.notifications || [];

  return (
    <Modal title="Notificaciones" wide onClose={onClose}>
      {list.length === 0 && (
        <EmptyState icon={<Bell size={32} color={T.teal} />} title="Sin notificaciones por ahora" subtitle="Aquí aparecerán alertas de presupuestos, objetivos, créditos y oportunidades cuando la app las detecte." />
      )}
      {list.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>{data.unreadCount} sin leer</span>
          {data.unreadCount > 0 && (
            <button onClick={() => actions.markAllNotificationsRead()}>
              <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Marcar todas como leídas</span>
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {list.map((n) => {
          const conf = NOTIFICATION_ICONS[n.type] || { icon: Info, color: T.ink, bg: T.bg };
          const Icon = conf.icon;
          return (
            <div key={n.id} className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: n.read ? T.surface : conf.bg, border: `1px solid ${n.read ? T.border : conf.bg}` }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={15} color={conf.color} />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: n.read ? 500 : 700 }}>{n.title}</p>
                  {!n.read && <div style={{ width: 7, height: 7, borderRadius: 4, background: T.coral, flexShrink: 0, marginTop: 4 }} />}
                </div>
                <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-0.5">{n.body}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span style={{ fontSize: 10.5, color: T.inkSoft }}>{relativeDay(n.createdAt)}</span>
                  <div className="flex items-center gap-3">
                    {!n.read && (
                      <button onClick={() => actions.markNotificationRead(n.id)}>
                        <span style={{ fontSize: 11, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Marcar leída</span>
                      </button>
                    )}
                    <IconButton icon={Trash2} size={13} onClick={() => actions.deleteNotification(n.id)} label="Descartar notificación" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
