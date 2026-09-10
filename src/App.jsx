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

/* ---------------------------------------------------------------------- */
/* UTILIDADES                                                              */
/* ---------------------------------------------------------------------- */
// Tokens de diseño y constantes → ./ui/theme
// Componentes de UI genéricos (Modal, Field, Card, botones…) → ./ui/primitives
// formatMoney / formatDate → ./lib/format
// Cálculo puro (balances, deudas, amortización, alertas) → ./lib/{finance,amortization,notifications}

function addOneYear(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
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

/* ---------------------------------------------------------------------- */
/* MOVIMIENTOS                                                            */
/* ---------------------------------------------------------------------- */
function Movimientos({ data, actions, visibleTransactions, setModal }) {
  const [filter, setFilter] = useState('todos'); // todos | income | expense | recurring | sporadic
  const currency = data.currency;

  const filtered = visibleTransactions.filter((t) => {
    if (t.type === 'settlement') return false;
    if (filter === 'income') return t.type === 'income';
    if (filter === 'expense') return t.type === 'expense';
    if (filter === 'recurring') return t.recurring;
    if (filter === 'sporadic') return !t.recurring;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  function removeTransaction(id) {
    actions.deleteTransaction(id);
  }

  return (
    <div className="pb-4">
      <GhostButton full onClick={() => setModal({ type: 'memberTransfer' })} style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <ArrowLeftRight size={14} /> Transferencia entre integrantes
      </GhostButton>
      <div className="flex gap-2 mb-4 overflow-x-auto pt-2">
        {[['todos', 'Todos'], ['income', 'Ingresos'], ['expense', 'Gastos'], ['recurring', 'Recurrentes'], ['sporadic', 'Esporádicos']].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className="flex-shrink-0 rounded-full px-3 py-1.5"
            style={{ background: filter === id ? T.ink : T.surface, border: `1px solid ${filter === id ? T.ink : T.border}` }}>
            <span style={{ fontSize: 12.5, color: filter === id ? '#fff' : T.inkSoft, fontFamily: FONT_BODY }}>{label}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && <EmptyState icon={<List size={36} color={T.teal} />} title="Sin movimientos" subtitle="No hay movimientos que coincidan con este filtro." />}

      <div className="flex flex-col gap-2">
        {filtered.map((t) => {
          if (t.type === 'transfer') {
            const member = data.members.find((m) => m.id === t.memberId);
            const account = data.accounts.find((a) => a.id === t.accountId);
            const isGoalTransfer = !!t.goalId;
            if (isGoalTransfer) {
              const isDeposit = t.transferDirection !== 'withdraw';
              return (
                <Card key={t.id}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5">
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PiggyBank size={18} color={T.amber} />
                      </div>
                      <div>
                        <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{t.description}</p>
                        <p style={{ fontSize: 11.5, color: T.inkSoft }}>Transferencia a objetivo · {formatDate(t.date)}{account ? ` · ${account.name}` : ''}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {member && <MemberChip member={member} size={18} />}
                          <span className="rounded-full px-2 py-0.5" style={{ background: T.amberSoft }}><span style={{ fontSize: 10, color: T.amber }}>No cuenta como gasto</span></span>
                        </div>
                      </div>
                    </div>
                    <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 14.5, color: T.amber }}>
                      {isDeposit ? '→' : '←'} {formatMoney(t.amount, currency)}
                    </span>
                  </div>
                </Card>
              );
            }
            // transferencia entre integrantes
            const toMember = data.members.find((m) => m.id === t.toMemberId);
            const toAccount = data.accounts.find((a) => a.id === t.toAccountId);
            return (
              <Card key={t.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2.5">
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: T.tealSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ArrowLeftRight size={18} color={T.teal} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{t.description || 'Transferencia entre integrantes'}</p>
                      <p style={{ fontSize: 11.5, color: T.inkSoft }}>{formatDate(t.date)}{account ? ` · ${account.name}` : ''}{toAccount ? ` → ${toAccount.name}` : ''}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {member && <MemberChip member={member} size={18} />}
                        <ArrowRight size={11} color={T.inkSoft} />
                        {toMember && <MemberChip member={toMember} size={18} />}
                        {t.settlesDebt && <span className="rounded-full px-2 py-0.5" style={{ background: T.tealSoft }}><span style={{ fontSize: 10, color: T.teal }}>Salda deuda</span></span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 14.5, color: T.teal }}>
                      {formatMoney(t.amount, currency)}
                    </span>
                    <IconButton icon={Trash2} variant="danger" onClick={() => removeTransaction(t.id)} confirmMessage="¿Eliminar esta transferencia? El dinero volverá al balance de quien la envió." label="Eliminar transferencia" />
                  </div>
                </div>
              </Card>
            );
          }
          const cat = data.categories.find((c) => c.id === t.categoryId);
          const member = data.members.find((m) => m.id === t.memberId);
          const account = data.accounts.find((a) => a.id === t.accountId);
          return (
            <Card key={t.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: t.type === 'income' ? T.tealSoft : T.coralSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
                    <CategoryIcon icon={cat?.icon} size={18} color={t.type === 'income' ? T.teal : T.coral} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{t.description || cat?.name}</p>
                    <p style={{ fontSize: 11.5, color: T.inkSoft }}>{cat?.name} · {formatDate(t.date)}{account ? ` · ${account.name}` : ''}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {member && <MemberChip member={member} size={18} />}
                      {t.recurring && <span className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: T.goldSoft }}><Repeat size={10} color={T.gold} /><span style={{ fontSize: 10, color: T.gold }}>{t.frequency}</span></span>}
                      {t.isShared && <span className="rounded-full px-2 py-0.5" style={{ background: T.tealSoft }}><span style={{ fontSize: 10, color: T.teal }}>Compartido</span></span>}
                      {t.version > 1 && (
                        <button onClick={() => setModal({ type: 'history', payload: t })} className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: T.bg }}>
                          <History size={10} color={T.inkSoft} /><span style={{ fontSize: 10, color: T.inkSoft }}>Editado ({t.version - 1})</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 14.5, color: t.type === 'income' ? T.teal : T.coral }}>
                    {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount, currency)}
                  </span>
                  <div className="flex items-center gap-2">
                    <IconButton icon={Pencil} onClick={() => setModal({ type: 'editTransaction', payload: t })} label="Editar movimiento" />
                    <IconButton icon={Trash2} variant="danger" onClick={() => removeTransaction(t.id)} confirmMessage="¿Eliminar este movimiento? Esta acción no se puede deshacer." label="Eliminar movimiento" />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* REGISTRO RÁPIDO (texto libre o foto de recibo, estilo "WhatsApp")      */
/* ---------------------------------------------------------------------- */
function matchCategory(guessName, type, categories) {
  const pool = categories.filter((c) => c.type === type);
  if (!guessName) return pool[0]?.id;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const g = norm(guessName);
  let found = pool.find((c) => norm(c.name) === g);
  if (!found) found = pool.find((c) => norm(c.name).includes(g) || g.includes(norm(c.name)));
  return (found || pool[0])?.id;
}
function matchMember(guessName, members) {
  if (!guessName) return null;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const g = norm(guessName);
  const found = members.find((m) => norm(m.name) === g || g.includes(norm(m.name)) || norm(m.name).includes(g));
  return found?.id || null;
}
function stripJsonFences(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

async function callAI({ system, content, provider, model }) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch('/api/ai-parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ provider, model, system, content }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error);
  return JSON.parse(stripJsonFences(json.text || ''));
}

function QuickCapture({ data, actions, setModal }) {
  const [mode, setMode] = useState('texto'); // texto | foto
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [asMember, setAsMember] = useState(data.members[0]?.id || '');

  const categoryNames = { income: data.categories.filter((c) => c.type === 'income').map((c) => c.name), expense: data.categories.filter((c) => c.type === 'expense').map((c) => c.name) };
  const memberNames = data.members.map((m) => m.name);

  function buildDraft(parsed, rawLabel) {
    const type = parsed.type === 'income' ? 'income' : 'expense';
    const categoryId = matchCategory(parsed.category, type, data.categories);
    const memberId = matchMember(parsed.member, data.members) || asMember || data.members[0]?.id;
    const account = data.accounts.find((a) => a.ownerIds?.includes(memberId)) || data.accounts[0];
    return {
      type,
      description: parsed.description || parsed.merchant || '',
      amount: parsed.amount || '',
      categoryId,
      accountId: account?.id,
      memberId,
      date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : todayISO(),
      source: 'quick',
      raw: rawLabel,
    };
  }

  async function analyzeText() {
    if (!text.trim()) return;
    setLoading(true); setError('');
    try {
      const system = `Extraes datos de un movimiento financiero de hogar a partir de un mensaje corto tipo WhatsApp, escrito por: ${asMember ? data.members.find(m=>m.id===asMember)?.name : 'un integrante'}. Hoy es ${todayISO()}. Categorías de ingreso disponibles: ${categoryNames.income.join(', ')}. Categorías de gasto disponibles: ${categoryNames.expense.join(', ')}. Integrantes del hogar: ${memberNames.join(', ')}. Responde SOLO con JSON válido, sin texto adicional, con este formato exacto: {"type":"income|expense","amount":number,"date":"YYYY-MM-DD","description":"texto corto","category":"nombre de categoría de la lista","member":"nombre del integrante si se menciona, si no null"}`;
      const parsed = await callAI({ system, content: [{ type: 'text', text }], provider: data.settings?.ai_provider, model: data.settings?.ai_model });
      setModal({ type: 'transaction', payload: buildDraft(parsed, text) });
      setText('');
    } catch (e) {
      setError('No se pudo interpretar el mensaje. Intenta de nuevo o descríbelo distinto.');
    } finally {
      setLoading(false);
    }
  }

  function onPickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function analyzeImage() {
    if (!imagePreview) return;
    setLoading(true); setError('');
    try {
      const base64Data = imagePreview.split(',')[1];
      const mediaType = imageFile.type || 'image/jpeg';
      const system = `Extraes datos de un recibo o factura en una foto para registrar un gasto de hogar. Hoy es ${todayISO()}. Categorías de gasto disponibles: ${categoryNames.expense.join(', ')}. Responde SOLO con JSON válido, sin texto adicional, con este formato exacto: {"type":"expense","amount":number,"date":"YYYY-MM-DD o null si no se ve","description":"nombre del comercio o resumen","category":"nombre de categoría de la lista"}`;
      const parsed = await callAI({
        system,
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'Extrae los datos de este recibo.' },
        ],
        provider: data.settings?.ai_provider, model: data.settings?.ai_model,
      });
      setModal({ type: 'transaction', payload: buildDraft(parsed, 'Foto de recibo') });
      setImageFile(null); setImagePreview(null);
    } catch (e) {
      setError('No se pudo leer el recibo. Intenta con una foto más clara o regístralo manualmente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-1">Registro rápido</p>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Escribe como si le mandaras un mensaje a tu familia, o sube la foto de un recibo. La IA detecta el monto, la categoría y la fecha; tú confirmas antes de guardar.
      </p>

      <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
        <Info size={14} color={T.teal} style={{ marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 11.5, color: T.ink, fontFamily: FONT_BODY }}>
          Esta app aún no recibe mensajes directamente desde el WhatsApp de cada integrante (eso requiere un servidor conectado a WhatsApp Business). Mientras tanto, cualquiera puede abrir esta pestaña desde su celular y registrar igual de rápido.
        </p>
      </div>

      <Field label="Registrar como">
        <select style={inputStyle} value={asMember} onChange={(e) => setAsMember(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>

      <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
        <button onClick={() => setMode('texto')} className="flex-1 rounded-lg py-2 flex items-center justify-center gap-1.5" style={{ background: mode === 'texto' ? T.surface : 'transparent', border: mode === 'texto' ? `1px solid ${T.border}` : 'none' }}>
          <MessageCircle size={15} color={T.ink} /><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Mensaje</span>
        </button>
        <button onClick={() => setMode('foto')} className="flex-1 rounded-lg py-2 flex items-center justify-center gap-1.5" style={{ background: mode === 'foto' ? T.surface : 'transparent', border: mode === 'foto' ? `1px solid ${T.border}` : 'none' }}>
          <Camera size={15} color={T.ink} /><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Foto de recibo</span>
        </button>
      </div>

      {mode === 'texto' && (
        <Card>
          <textarea
            style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
            placeholder='Ej. "Pagué 350 de gasolina hoy" o "Me depositaron 8000 de nómina"'
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <PrimaryButton full onClick={analyzeText} style={{ marginTop: 12 }}>
            {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Analizando…</span> : 'Detectar movimiento'}
          </PrimaryButton>
        </Card>
      )}

      {mode === 'foto' && (
        <Card>
          {imagePreview ? (
            <img src={imagePreview} alt="Recibo" className="w-full rounded-xl mb-3" style={{ maxHeight: 260, objectFit: 'contain', background: T.bg }} />
          ) : (
            <label className="flex flex-col items-center justify-center rounded-xl py-8 cursor-pointer" style={{ border: `1.5px dashed ${T.border}`, background: T.bg }}>
              <ImageIcon size={28} color={T.inkSoft} />
              <span style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">Toca para elegir o tomar una foto</span>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickImage} />
            </label>
          )}
          {imagePreview && (
            <div className="flex gap-2">
              <GhostButton onClick={() => { setImageFile(null); setImagePreview(null); }}>Cambiar foto</GhostButton>
              <PrimaryButton full onClick={analyzeImage}>
                {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Leyendo recibo…</span> : 'Leer recibo'}
              </PrimaryButton>
            </div>
          )}
        </Card>
      )}

      {error && <p style={{ fontSize: 12.5, color: T.danger, fontFamily: FONT_BODY }} className="mt-3">{error}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* MODAL: TRANSACCIÓN                                                     */
/* ---------------------------------------------------------------------- */
function TransactionModal({ data, actions, payload, onClose }) {
  const [type, setType] = useState(payload?.type || 'expense');
  const [description, setDescription] = useState(payload?.description || '');
  const [amount, setAmount] = useState(payload?.amount ? String(payload.amount) : '');
  const [categoryId, setCategoryId] = useState(payload?.categoryId || '');
  const [accountId, setAccountId] = useState(payload?.accountId || data.accounts[0]?.id || '');
  const [memberId, setMemberId] = useState(payload?.memberId || data.members[0]?.id || '');
  const [date, setDate] = useState(payload?.date || todayISO());
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState('mensual');
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [participants, setParticipants] = useState(data.members.map((m) => m.id));
  const [splitMode, setSplitMode] = useState('equal'); // equal | custom | income
  const [customPercents, setCustomPercents] = useState({});

  const cats = data.categories.filter((c) => c.type === type);
  useEffect(() => { if (!categoryId && cats.length) setCategoryId(cats[0].id); }, [type]);

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !categoryId || !accountId || !memberId) return;
    let participantsData = null;
    if (type === 'expense' && isShared && participants.length) {
      let percents;
      if (splitMode === 'income') {
        percents = computeIncomeShares(data.transactions, participants);
      } else if (splitMode === 'custom') {
        const total = participants.reduce((s, id) => s + (parseFloat(customPercents[id]) || 0), 0) || 100;
        percents = Object.fromEntries(participants.map((id) => [id, ((parseFloat(customPercents[id]) || 0) / total) * 100]));
      } else {
        const eq = 100 / participants.length;
        percents = Object.fromEntries(participants.map((id) => [id, eq]));
      }
      participantsData = participants.map((id) => ({ memberId: id, share: amt * (percents[id] / 100) }));
    }
    const t = {
      type, description, amount: amt, categoryId, accountId, memberId, date,
      recurring, frequency: recurring ? frequency : null,
      isShared: type === 'expense' ? isShared : false,
      participants: participantsData,
    };
    setSaving(true);
    try {
      await actions.addTransaction(t);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function toggleParticipant(id) {
    setParticipants((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  return (
    <Modal title={payload?.source === 'quick' ? 'Revisa lo detectado' : 'Nuevo movimiento'} onClose={onClose}>
      {payload?.source === 'quick' && (
        <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.goldSoft }}>
          <Info size={15} color={T.gold} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>
            Esto se extrajo automáticamente{payload?.raw ? `: "${payload.raw}"` : ''}. Revisa y ajusta antes de guardar.
          </p>
        </div>
      )}
      <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
        <button onClick={() => setType('expense')} className="flex-1 rounded-lg py-2" style={{ background: type === 'expense' ? T.coral : 'transparent' }}>
          <span style={{ color: type === 'expense' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5 }}>Gasto</span>
        </button>
        <button onClick={() => setType('income')} className="flex-1 rounded-lg py-2" style={{ background: type === 'income' ? T.teal : 'transparent' }}>
          <span style={{ color: type === 'income' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5 }}>Ingreso</span>
        </button>
      </div>

      <Field label="Descripción (opcional)">
        <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Supermercado" />
      </Field>
      <Field label="Monto">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Categoría">
        <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Cuenta">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label={type === 'income' ? 'Recibido por' : 'Pagado por'}>
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha">
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        <span style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY }}>Es recurrente</span>
      </label>
      {recurring && (
        <Field label="Frecuencia">
          <select style={inputStyle} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="semanal">Semanal</option>
            <option value="quincenal">Quincenal</option>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
        </Field>
      )}

      {type === 'expense' && data.members.length > 1 && (
        <>
          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
            <span style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY }}>Gasto compartido entre integrantes</span>
          </label>
          {isShared && (
            <>
              <Field label="Se divide entre">
                <div className="flex flex-col gap-1.5">
                  {data.members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={participants.includes(m.id)} onChange={() => toggleParticipant(m.id)} />
                      <MemberChip member={m} size={18} />
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Cómo se reparte">
                <select style={inputStyle} value={splitMode} onChange={(e) => setSplitMode(e.target.value)}>
                  <option value="equal">Partes iguales (50/50 entre los seleccionados)</option>
                  <option value="custom">Porcentaje personalizado</option>
                  <option value="income">Proporcional a ingresos (promedio 3 meses)</option>
                </select>
              </Field>
              {splitMode === 'custom' && (
                <Field label="Porcentaje de cada integrante">
                  <div className="flex flex-col gap-2">
                    {participants.map((id) => {
                      const m = data.members.find((mm) => mm.id === id);
                      return (
                        <div key={id} className="flex items-center gap-2">
                          <div style={{ width: 90 }}><MemberChip member={m} size={18} /></div>
                          <input type="number" style={{ ...inputStyle, flex: 1 }} value={customPercents[id] ?? ''}
                            onChange={(e) => setCustomPercents({ ...customPercents, [id]: e.target.value })} placeholder="%" />
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1.5">Se ajusta automáticamente a que sume 100%, aunque no lo cuadres exacto.</p>
                </Field>
              )}
              {splitMode === 'income' && amount && (
                <div className="rounded-xl p-3 mb-4" style={{ background: T.bg }}>
                  {participants.map((id) => {
                    const m = data.members.find((mm) => mm.id === id);
                    const pct = computeIncomeShares(data.transactions, participants)[id];
                    return (
                      <div key={id} className="flex items-center justify-between mb-1">
                        <MemberChip member={m} size={18} />
                        <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink }}>{pct.toFixed(0)}% · {formatMoney((parseFloat(amount) || 0) * pct / 100, data.currency)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      <PrimaryButton full onClick={save} style={{ marginTop: 8 }}>{saving ? 'Guardando…' : 'Guardar movimiento'}</PrimaryButton>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* EDICIÓN DE MOVIMIENTOS — con confirmación e histórico                  */
/* ---------------------------------------------------------------------- */
const FIELD_LABELS = {
  type: 'Tipo', description: 'Descripción', amount: 'Monto', categoryId: 'Categoría',
  accountId: 'Cuenta', memberId: 'Integrante', date: 'Fecha', recurring: 'Recurrente',
  frequency: 'Frecuencia', isShared: 'Compartido',
};

function describeValue(field, value, data) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'type') return value === 'income' ? 'Ingreso' : 'Gasto';
  if (field === 'amount') return formatMoney(value, data.currency);
  if (field === 'categoryId') return data.categories.find((c) => c.id === value)?.name || value;
  if (field === 'accountId') return data.accounts.find((a) => a.id === value)?.name || value;
  if (field === 'memberId') return data.members.find((m) => m.id === value)?.name || value;
  if (field === 'date') return formatDate(value);
  if (field === 'recurring' || field === 'isShared') return value ? 'Sí' : 'No';
  return String(value);
}

function diffTransactions(original, edited, data) {
  const fields = ['type', 'description', 'amount', 'categoryId', 'accountId', 'memberId', 'date', 'recurring', 'frequency', 'isShared'];
  return fields
    .filter((f) => String(original[f] ?? '') !== String(edited[f] ?? ''))
    .map((f) => ({ field: f, label: FIELD_LABELS[f], before: describeValue(f, original[f], data), after: describeValue(f, edited[f], data) }));
}

function EditTransactionModal({ data, actions, payload: original, onClose }) {
  const [step, setStep] = useState('edit'); // edit | confirm
  const [type, setType] = useState(original.type);
  const [description, setDescription] = useState(original.description || '');
  const [amount, setAmount] = useState(String(original.amount));
  const [categoryId, setCategoryId] = useState(original.categoryId);
  const [accountId, setAccountId] = useState(original.accountId);
  const [memberId, setMemberId] = useState(original.memberId);
  const [date, setDate] = useState(original.date);
  const [recurring, setRecurring] = useState(!!original.recurring);
  const [frequency, setFrequency] = useState(original.frequency || 'mensual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cats = data.categories.filter((c) => c.type === type);

  const edited = {
    type, description, amount: parseFloat(amount) || 0, categoryId, accountId, memberId, date,
    recurring, frequency: recurring ? frequency : null,
    isShared: original.isShared, participants: original.participants,
  };
  const changes = diffTransactions(original, edited, data);

  function goToConfirm() {
    if (!edited.amount || edited.amount <= 0 || !categoryId || !accountId || !memberId) return;
    if (changes.length === 0) { onClose(); return; }
    setStep('confirm');
  }

  async function confirm() {
    setSaving(true); setError('');
    try {
      await actions.updateTransaction(original, edited);
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo guardar la edición.');
      setSaving(false);
    }
  }

  if (step === 'confirm') {
    return (
      <Modal title="Confirmar cambios" onClose={onClose}>
        <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
          Este movimiento ya existe y tiene historial. Revisa los cambios antes de guardarlos — quedarán registrados con tu nombre y la fecha de hoy.
        </p>
        <div className="flex flex-col gap-2 mb-5">
          {changes.map((c) => (
            <div key={c.field} className="rounded-xl p-3" style={{ background: T.bg }}>
              <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-1">{c.label}</p>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 13, color: T.danger, fontFamily: FONT_MONO, textDecoration: 'line-through' }}>{c.before}</span>
                <ArrowRight size={12} color={T.inkSoft} />
                <span style={{ fontSize: 13, color: T.teal, fontFamily: FONT_MONO, fontWeight: 600 }}>{c.after}</span>
              </div>
            </div>
          ))}
        </div>
        {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
        <div className="flex gap-2">
          <GhostButton onClick={() => setStep('edit')}>Volver</GhostButton>
          <PrimaryButton full onClick={confirm}>{saving ? 'Guardando…' : 'Confirmar cambios'}</PrimaryButton>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Editar movimiento" onClose={onClose}>
      <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
        <button onClick={() => setType('expense')} className="flex-1 rounded-lg py-2" style={{ background: type === 'expense' ? T.coral : 'transparent' }}>
          <span style={{ color: type === 'expense' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5 }}>Gasto</span>
        </button>
        <button onClick={() => setType('income')} className="flex-1 rounded-lg py-2" style={{ background: type === 'income' ? T.teal : 'transparent' }}>
          <span style={{ color: type === 'income' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5 }}>Ingreso</span>
        </button>
      </div>
      <Field label="Descripción (opcional)">
        <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Monto">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Categoría">
        <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Cuenta">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label={type === 'income' ? 'Recibido por' : 'Pagado por'}>
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha">
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        <span style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY }}>Es recurrente</span>
      </label>
      {recurring && (
        <Field label="Frecuencia">
          <select style={inputStyle} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="semanal">Semanal</option>
            <option value="quincenal">Quincenal</option>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
        </Field>
      )}
      <PrimaryButton full onClick={goToConfirm} style={{ marginTop: 8 }}>Revisar cambios</PrimaryButton>
    </Modal>
  );
}

function HistoryModal({ data, actions, payload: tx, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    actions.getTransactionHistory(tx.id).then(setEntries).catch((e) => setError(e.message));
  }, [tx.id]);

  const current = {
    type: tx.type, description: tx.description, amount: tx.amount, categoryId: tx.categoryId,
    accountId: tx.accountId, memberId: tx.memberId, date: tx.date, recurring: tx.recurring,
    frequency: tx.frequency, isShared: tx.isShared,
  };

  return (
    <Modal title="Historial de este movimiento" onClose={onClose}>
      <div className="rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
        <p style={{ fontSize: 11.5, color: T.teal, fontFamily: FONT_BODY }} className="mb-1">Estado actual</p>
        <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>{describeValue('description', current.description, data) !== '—' ? current.description : data.categories.find((c) => c.id === current.categoryId)?.name}</p>
        <p style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.ink }}>{formatMoney(current.amount, data.currency)} · {formatDate(current.date)}</p>
      </div>

      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      {!entries && !error && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Cargando historial…</p>}

      <div className="flex flex-col gap-3">
        {entries && entries.map((h, i) => {
          const nextState = i === 0 ? current : entries[i - 1].snapshot;
          const changes = diffTransactions(h.snapshot, nextState, data);
          return (
            <div key={h.id} className="rounded-xl p-3" style={{ border: `1px solid ${T.border}` }}>
              <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">
                Editado por <b>{h.editorName}</b> · {formatDate(h.editedAt.slice(0, 10))}
              </p>
              {changes.length === 0 ? (
                <p style={{ fontSize: 12, color: T.inkSoft }}>Sin cambios detectados en estos campos.</p>
              ) : changes.map((c) => (
                <div key={c.field} className="flex items-center gap-2 mb-1">
                  <span style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY, minWidth: 70 }}>{c.label}:</span>
                  <span style={{ fontSize: 12, color: T.danger, fontFamily: FONT_MONO, textDecoration: 'line-through' }}>{c.before}</span>
                  <ArrowRight size={11} color={T.inkSoft} />
                  <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_MONO }}>{c.after}</span>
                </div>
              ))}
            </div>
          );
        })}
        {entries && entries.length === 0 && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Este movimiento no tiene ediciones registradas.</p>}
      </div>
    </Modal>
  );
}
function Objetivos({ data, actions, setModal }) {
  const currency = data.currency;
  const myId = actions.userId;
  const sorted = [...data.goals].sort((a, b) => goalPriorityScore(b) - goalPriorityScore(a));
  const [requests, setRequests] = useState(null);

  async function refreshRequests() {
    setRequests(await actions.loadPendingGoalRequests());
  }
  useEffect(() => { refreshRequests(); }, []);

  function removeGoal(id) { actions.removeGoal(id); }

  async function vote(request, approve) {
    await actions.voteOnGoalRequest(request, approve);
    await refreshRequests();
  }

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Objetivos de compra</p>
        <PrimaryButton onClick={() => setModal({ type: 'goal' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nuevo</PrimaryButton>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Cada objetivo es un "bolsillo": lo que aportas se aparta de tu saldo disponible, pero no cuenta como gasto. Los familiares se votan entre todos; para editarlos o retirar dinero se necesita que todos aprueben.
      </p>

      {requests?.length > 0 && (
        <Card style={{ marginBottom: 16, background: T.amberSoft, border: 'none' }}>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Solicitudes pendientes de aprobación</p>
          {requests.map((r) => {
            const already = r.votes.find((v) => v.member_id === myId);
            return (
              <div key={r.id} className="rounded-xl p-3 mb-2" style={{ background: T.surface }}>
                <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>
                  <b>{r.requestedByName}</b> pidió {r.changeType === 'withdraw' ? `retirar ${formatMoney(r.withdrawAmount, currency)} de` : 'editar la meta de'} "{r.goalName}"
                  {r.changeType === 'edit_target' && ` a ${formatMoney(r.newTargetAmount, currency)}${r.newTargetDate ? ` (${formatDate(r.newTargetDate)})` : ''}`}
                </p>
                <p style={{ fontSize: 11, color: T.inkSoft }} className="mb-2">{r.votes.filter((v) => v.approve).length}/{data.members.length} aprobaciones — se necesita unanimidad</p>
                {already ? (
                  <p style={{ fontSize: 11.5, color: T.teal }}>Ya {already.approve ? 'aprobaste' : 'rechazaste'} esta solicitud</p>
                ) : (
                  <div className="flex gap-2">
                    <GhostButton onClick={() => vote(r, false)} style={{ flex: 1, fontSize: 12, padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><ThumbsDown size={13} /> Rechazar</GhostButton>
                    <PrimaryButton onClick={() => vote(r, true)} style={{ flex: 1, fontSize: 12, padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><ThumbsUp size={13} /> Aprobar</PrimaryButton>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {sorted.length === 0 && <EmptyState icon={<Target size={36} color={T.teal} />} title="Sin objetivos aún" subtitle="Crea una meta de compra, como 'Vacaciones' o 'Nuevo refrigerador'." />}

      <div className="flex flex-col gap-3">
        {sorted.map((g) => {
          const score = goalPriorityScore(g);
          const pct = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
          const votesCount = Object.keys(g.votes || {}).length;
          const owner = g.ownerMemberId ? data.members.find((m) => m.id === g.ownerMemberId) : null;
          return (
            <Card key={g.id}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: T.ink }}>{g.name}</p>
                    {owner ? (
                      <span className="rounded-full px-2 py-0.5" style={{ background: T.bg }}><span style={{ fontSize: 9.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{owner.name}</span></span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: T.tealSoft }}><Users2 size={9} color={T.teal} /><span style={{ fontSize: 9.5, color: T.teal, fontFamily: FONT_BODY }}>Familiar</span></span>
                    )}
                  </div>
                  {g.targetDate && <p style={{ fontSize: 11.5, color: T.inkSoft }}>Meta para {formatDate(g.targetDate)}</p>}
                </div>
                <div className="flex items-center gap-1 rounded-full px-2 py-1" style={{ background: score >= 2.5 ? T.coralSoft : score >= 1.5 ? T.goldSoft : T.tealSoft }}>
                  <Star size={12} color={score >= 2.5 ? T.coral : score >= 1.5 ? T.gold : T.teal} />
                  <span style={{ fontSize: 11, fontFamily: FONT_BODY, color: T.ink }}>{score >= 2.5 ? 'Alta' : score >= 1.5 ? 'Media' : 'Baja'} · {votesCount}/{data.members.length} votos</span>
                </div>
              </div>
              <ProgressBar value={pct} color={T.gold} />
              <div className="flex items-center justify-between mt-1.5">
                <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.inkSoft }}>{formatMoney(g.currentAmount, currency)} de {formatMoney(g.targetAmount, currency)}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink }}>{Math.round(pct)}%</span>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <GhostButton onClick={() => setModal({ type: 'vote', payload: g })} style={{ flex: 1, fontSize: 12, padding: '8px' }}>Votar</GhostButton>
                <GhostButton onClick={() => setModal({ type: 'editGoal', payload: g })} style={{ flex: 1, fontSize: 12, padding: '8px' }}>Editar</GhostButton>
                <PrimaryButton onClick={() => setModal({ type: 'contribute', payload: g })} style={{ flex: 1, fontSize: 12, padding: '8px' }}>Aportar</PrimaryButton>
                {g.currentAmount > 0 && <GhostButton onClick={() => setModal({ type: 'withdrawGoal', payload: g })} style={{ flex: 1, fontSize: 12, padding: '8px' }}>Retirar</GhostButton>}
                <IconButton icon={Trash2} variant="danger" onClick={() => removeGoal(g.id)} confirmMessage={`¿Eliminar el objetivo "${g.name}"? Se perderá todo el progreso registrado.`} label="Eliminar objetivo" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function GoalModal({ data, actions, onClose }) {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [ownerMemberId, setOwnerMemberId] = useState('');
  async function save() {
    if (!name.trim() || !parseFloat(targetAmount)) return;
    await actions.addGoal({ name: name.trim(), targetAmount: parseFloat(targetAmount), targetDate: targetDate || null, ownerMemberId: ownerMemberId || null });
    onClose();
  }
  return (
    <Modal title="Nuevo objetivo de compra" onClose={onClose}>
      <Field label="Nombre del objetivo">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Vacaciones en familia" />
      </Field>
      <Field label="Monto meta">
        <input style={inputStyle} type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Fecha meta (opcional)">
        <input style={inputStyle} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Field label="Alcance">
        <select style={inputStyle} value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
          <option value="">Familiar (todo el hogar vota y aprueba cambios)</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>Individual — solo {m.name}</option>)}
        </select>
      </Field>
      <PrimaryButton full onClick={save}>Crear objetivo</PrimaryButton>
    </Modal>
  );
}

function VoteModal({ data, actions, payload, onClose }) {
  const goal = payload;
  const [votes, setVotes] = useState(goal.votes || {});
  async function save() {
    await actions.voteGoal(goal.id, votes);
    onClose();
  }
  return (
    <Modal title={`Votar prioridad: ${goal.name}`} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Cada integrante elige qué tan prioritario es este objetivo para el hogar.</p>
      {data.members.map((m) => (
        <div key={m.id} className="flex items-center justify-between mb-3">
          <MemberChip member={m} />
          <div className="flex gap-1.5">
            {[1, 2, 3].map((v) => (
              <button key={v} onClick={() => setVotes({ ...votes, [m.id]: v })}
                className="rounded-lg px-2.5 py-1.5"
                style={{ background: votes[m.id] === v ? T.gold : T.bg, border: `1px solid ${votes[m.id] === v ? T.gold : T.border}` }}>
                <span style={{ fontSize: 11.5, color: votes[m.id] === v ? '#fff' : T.inkSoft }}>{PRIORITY_LABEL[v]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <PrimaryButton full onClick={save}>Guardar votos</PrimaryButton>
    </Modal>
  );
}

function ContributeModal({ data, actions, payload, onClose }) {
  const goal = payload;
  const [amount, setAmount] = useState('');
  const [memberId, setMemberId] = useState(data.members[0]?.id || '');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [saving, setSaving] = useState(false);
  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await actions.contributeGoal(goal, amt, memberId, accountId);
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={`Aportar a: ${goal.name}`} onClose={onClose}>
      <Field label="Monto a aportar">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Integrante que aporta">
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Desde la cuenta">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-4">Este dinero se aparta como una transferencia — no cuenta como gasto, pero sí reduce el saldo disponible de la cuenta.</p>
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Confirmar aporte'}</PrimaryButton>
    </Modal>
  );
}

function WithdrawGoalModal({ data, actions, payload, onClose }) {
  const goal = payload;
  const isFamiliar = !goal.ownerMemberId;
  const [amount, setAmount] = useState('');
  const [memberId, setMemberId] = useState(goal.ownerMemberId || data.members[0]?.id || '');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || amt > goal.currentAmount) { setError('Ingresa un monto válido (no puede superar lo acumulado).'); return; }
    if (!isFamiliar && !confirm(`¿Retirar ${formatMoney(amt, data.currency)} de "${goal.name}"?`)) return;
    setSaving(true); setError('');
    try {
      const result = await actions.editOrWithdrawGoal(goal, {
        type: 'withdraw', withdrawAmount: amt, withdrawMemberId: memberId, withdrawAccountId: accountId,
      });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo procesar el retiro.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Retirar de: ${goal.name}`} onClose={onClose}>
      {isFamiliar && (
        <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.amberSoft }}>
          <Info size={14} color={T.amber} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 11.5, color: T.ink, fontFamily: FONT_BODY }}>Como es un objetivo familiar, este retiro necesita que todos los integrantes lo aprueben antes de aplicarse.</p>
        </div>
      )}
      <Field label={`Monto a retirar (disponible: ${formatMoney(goal.currentAmount, data.currency)})`}>
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Integrante">
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Hacia la cuenta">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Procesando…' : isFamiliar ? 'Enviar para aprobación' : 'Confirmar retiro'}</PrimaryButton>
    </Modal>
  );
}

function EditGoalModal({ data, actions, payload, onClose }) {
  const goal = payload;
  const isFamiliar = !goal.ownerMemberId;
  const [targetAmount, setTargetAmount] = useState(String(goal.targetAmount));
  const [targetDate, setTargetDate] = useState(goal.targetDate || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const amt = parseFloat(targetAmount);
    if (!amt) { setError('Ingresa un monto meta válido.'); return; }
    if (!isFamiliar && !confirm(`¿Confirmar el nuevo monto meta de "${goal.name}"?`)) return;
    setSaving(true); setError('');
    try {
      await actions.editOrWithdrawGoal(goal, { type: 'edit_target', newTargetAmount: amt, newTargetDate: targetDate || null });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo guardar el cambio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Editar: ${goal.name}`} onClose={onClose}>
      {isFamiliar && (
        <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.amberSoft }}>
          <Info size={14} color={T.amber} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 11.5, color: T.ink, fontFamily: FONT_BODY }}>Como es un objetivo familiar, este cambio necesita que todos los integrantes lo aprueben antes de aplicarse.</p>
        </div>
      )}
      <Field label="Nuevo monto meta">
        <input style={inputStyle} type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
      </Field>
      <Field label="Nueva fecha meta (opcional)">
        <input style={inputStyle} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : isFamiliar ? 'Enviar para aprobación' : 'Guardar cambio'}</PrimaryButton>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* PRESUPUESTOS                                                           */
/* ---------------------------------------------------------------------- */
function Presupuestos({ data, actions, setModal }) {
  const mKey = thisMonthKey();
  const currency = data.currency;

  function removeBudget(id) { actions.removeBudget(id); }

  // Presupuesto sugerido = promedio de gasto real de los últimos 3 meses completos,
  // para categorías que aún no tienen un presupuesto configurado (a nivel de hogar).
  const configuredCategoryIds = new Set(data.budgets.filter((b) => b.scope === 'household').map((b) => b.categoryId));
  const now = new Date(todayISO() + 'T00:00:00');
  const monthKeys = [1, 2, 3].map((n) => {
    const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const suggestions = data.categories
    .filter((c) => c.type === 'expense' && !configuredCategoryIds.has(c.id))
    .map((c) => {
      const totalByMonth = monthKeys.map((mk) =>
        data.transactions
          .filter((t) => t.type === 'expense' && t.categoryId === c.id && occurrencesInMonth(t, mk))
          .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mk), 0)
      );
      const monthsWithData = totalByMonth.filter((v) => v > 0).length;
      const avg = monthsWithData ? totalByMonth.reduce((a, b) => a + b, 0) / monthsWithData : 0;
      return { category: c, avg, monthsWithData };
    })
    .filter((s) => s.avg > 0)
    .sort((a, b) => b.avg - a.avg);

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Presupuestos mensuales</p>
        <PrimaryButton onClick={() => setModal({ type: 'budget' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nuevo</PrimaryButton>
      </div>

      {data.budgets.length === 0 && <EmptyState icon={<PiggyBank size={36} color={T.teal} />} title="Sin presupuestos" subtitle="Define límites mensuales por categoría para recibir alertas antes de excederte." />}

      <div className="flex flex-col gap-3 mb-5">
        {data.budgets.map((b) => {
          const cat = data.categories.find((c) => c.id === b.categoryId);
          const spent = data.transactions
            .filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && occurrencesInMonth(t, mKey) && (b.scope === 'household' || t.memberId === b.scope))
            .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mKey), 0);
          const pct = (spent / b.limit) * 100;
          const scopeLabel = b.scope === 'household' ? 'Todo el hogar' : data.members.find((m) => m.id === b.scope)?.name;
          return (
            <Card key={b.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5" style={{ fontFamily: FONT_BODY, fontWeight: 500, fontSize: 14, color: T.ink }}><CategoryIcon icon={cat?.icon} size={16} /> {cat?.name}</span>
                <IconButton icon={Trash2} variant="danger" onClick={() => removeBudget(b.id)} confirmMessage="¿Eliminar este presupuesto?" label="Eliminar presupuesto" />
              </div>
              <p style={{ fontSize: 11, color: T.inkSoft }} className="mb-2">{scopeLabel}</p>
              <ProgressBar value={pct} color={pct >= 100 ? T.danger : pct >= 80 ? T.gold : T.teal} />
              <div className="flex items-center justify-between mt-1.5">
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.inkSoft }}>{formatMoney(spent, currency)} de {formatMoney(b.limit, currency)}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: pct >= 100 ? T.danger : T.ink }}>{Math.round(pct)}%</span>
              </div>
            </Card>
          );
        })}
      </div>

      {suggestions.length > 0 && (
        <>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-1">Sugeridos automáticamente</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Con base en tu gasto promedio de los últimos meses en categorías que aún no tienen un presupuesto.</p>
          <div className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <Card key={s.category.id} style={{ background: T.bg, border: `1px dashed ${T.border}` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="flex items-center gap-1.5" style={{ fontFamily: FONT_BODY, fontWeight: 500, fontSize: 13.5, color: T.ink }}><CategoryIcon icon={s.category.icon} size={15} /> {s.category.name}</span>
                    <p style={{ fontSize: 10.5, color: T.inkSoft }} className="mt-0.5">Promedio de {s.monthsWithData} mes(es) · {formatMoney(s.avg, currency)}/mes</p>
                  </div>
                  <GhostButton onClick={() => setModal({ type: 'budget', payload: { categoryId: s.category.id, limit: s.avg } })} style={{ fontSize: 11.5, padding: '7px 12px' }}>Usar</GhostButton>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BudgetModal({ data, actions, payload, onClose }) {
  const expenseCats = data.categories.filter((c) => c.type === 'expense');
  const [categoryId, setCategoryId] = useState(payload?.categoryId || expenseCats[0]?.id || '');
  const [limit, setLimit] = useState(payload?.limit ? String(Math.round(payload.limit)) : '');
  const [scope, setScope] = useState('household');
  async function save() {
    const lim = parseFloat(limit);
    if (!lim || !categoryId) return;
    await actions.addBudget({ categoryId, limit: lim, scope });
    onClose();
  }
  return (
    <Modal title="Nuevo presupuesto" onClose={onClose}>
      <Field label="Categoría">
        <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Límite mensual">
        <input style={inputStyle} type="number" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Aplica a">
        <select style={inputStyle} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="household">Todo el hogar</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>Solo {m.name}</option>)}
        </select>
      </Field>
      <PrimaryButton full onClick={save}>Guardar presupuesto</PrimaryButton>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* CONCILIACIÓN (quién debe a quién)                                      */
/* ---------------------------------------------------------------------- */
/* ---------------------------------------------------------------------- */
/* CUENTAS                                                                */
/* ---------------------------------------------------------------------- */
function Cuentas({ data, actions, setModal }) {
  const currency = data.currency;
  function balanceOf(acc) {
    let total = 0;
    data.transactions.forEach((t) => {
      if (t.type === 'income' && t.accountId === acc.id) total += t.amount;
      else if (t.type === 'expense' && t.accountId === acc.id) total -= t.amount;
      else if (t.type === 'transfer') {
        if (t.goalId) {
          // aporte/retiro de objetivo: solo afecta la cuenta de origen
          if (t.accountId === acc.id) total += t.transferDirection === 'withdraw' ? t.amount : -t.amount;
        } else {
          // transferencia entre integrantes: sale de la cuenta origen, entra a la de destino
          if (t.accountId === acc.id) total -= t.amount;
          if (t.toAccountId === acc.id) total += t.amount;
        }
      }
    });
    return total;
  }
  function removeAccount(id) { actions.removeAccount(id); }

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Cuentas</p>
        <PrimaryButton onClick={() => setModal({ type: 'account' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nueva</PrimaryButton>
      </div>
      <div className="flex flex-col gap-3">
        {data.accounts.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div style={{ width: 34, height: 34, borderRadius: 10, background: a.type === 'shared' ? T.tealSoft : T.goldSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Landmark size={16} color={a.type === 'shared' ? T.teal : T.gold} />
                </div>
                <div>
                  <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{a.name}</p>
                  <p style={{ fontSize: 11, color: T.inkSoft }}>{a.type === 'shared' ? 'Compartida' : 'Individual'} · {a.ownerIds.map((id) => data.members.find((m) => m.id === id)?.name).join(', ')}</p>
                </div>
              </div>
              <IconButton icon={Trash2} variant="danger" onClick={() => removeAccount(a.id)} confirmMessage={`¿Eliminar la cuenta "${a.name}"? Los movimientos ya registrados en ella no se borrarán.`} label="Eliminar cuenta" />
            </div>
            <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 18, color: T.ink }} className="mt-2">{formatMoney(balanceOf(a), currency)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AccountModal({ data, actions, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('individual');
  const [ownerIds, setOwnerIds] = useState([data.members[0]?.id]);
  const [initialBalance, setInitialBalance] = useState('');
  const [saving, setSaving] = useState(false);
  function toggle(id) { setOwnerIds((o) => o.includes(id) ? o.filter((x) => x !== id) : [...o, id]); }
  async function save() {
    if (!name.trim() || !ownerIds.length) return;
    setSaving(true);
    try {
      await actions.addAccount({ name: name.trim(), type, ownerIds, initialBalance: parseFloat(initialBalance) || 0 });
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title="Nueva cuenta" onClose={onClose}>
      <Field label="Nombre de la cuenta">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cuenta de ahorros" />
      </Field>
      <Field label="Tipo">
        <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="individual">Individual</option>
          <option value="shared">Compartida</option>
        </select>
      </Field>
      <Field label="Integrantes asociados">
        <div className="flex flex-col gap-1.5">
          {data.members.map((m) => (
            <label key={m.id} className="flex items-center gap-2">
              <input type="checkbox" checked={ownerIds.includes(m.id)} onChange={() => toggle(m.id)} />
              <MemberChip member={m} size={18} />
            </label>
          ))}
        </div>
      </Field>
      <Field label="Saldo inicial (opcional)">
        <input style={inputStyle} type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0" />
      </Field>
      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Si la cuenta ya tiene dinero, regístralo aquí — se guarda como un ingreso inicial.</p>
      <PrimaryButton full onClick={save}>{saving ? 'Creando…' : 'Crear cuenta'}</PrimaryButton>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* CRÉDITOS                                                               */
/* ---------------------------------------------------------------------- */
const CREDIT_TYPE_LABELS = { vivienda: 'Vivienda', vehiculo: 'Vehículo', libre_inversion: 'Libre inversión', educativo: 'Educativo', otro: 'Otro' };
const INSURANCE_TYPE_LABELS = { vida: 'Vida (todos los créditos)', incendio_terremoto: 'Incendio y terremoto (vivienda)', desempleo: 'Desempleo', otro: 'Otro' };

function Creditos({ data, actions, setModal }) {
  const [credits, setCredits] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  async function refresh() {
    const list = await actions.loadCredits();
    setCredits(list);
  }
  useEffect(() => { refresh(); }, []);

  if (selectedId) {
    const credit = credits?.find((c) => c.id === selectedId);
    if (!credit) return null;
    return <CreditDetail data={data} actions={actions} credit={credit} setModal={setModal}
      onBack={() => setSelectedId(null)}
      onDeleted={() => { setSelectedId(null); refresh(); }} />;
  }

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Créditos</p>
        <PrimaryButton onClick={() => setModal({ type: 'credit', onCreated: refresh })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nuevo</PrimaryButton>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Un crédito marcado como individual solo lo ves tú; si lo dejas sin integrante específico, todo el hogar lo verá.
      </p>

      {credits === null && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Cargando…</p>}
      {credits?.length === 0 && <EmptyState icon={<CreditCard size={36} color={T.teal} />} title="Sin créditos registrados" subtitle="Agrega tu primer crédito para llevar el control de cuotas, intereses y seguros." />}

      <div className="flex flex-col gap-3">
        {credits?.map((c) => (
          <Card key={c.id} style={{ cursor: 'pointer' }}>
            <div onClick={() => setSelectedId(c.id)}>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: T.ink }}>{c.name}</p>
                  <p style={{ fontSize: 11.5, color: T.inkSoft }}>{CREDIT_TYPE_LABELS[c.creditType] || 'Crédito'} · {c.currency} · {c.amortizationSystem === 'frances' ? 'Sistema francés' : 'Sistema alemán'}</p>
                </div>
                <span className="rounded-full px-2 py-1" style={{ background: c.status === 'pagado' ? T.tealSoft : T.coralSoft }}>
                  <span style={{ fontSize: 10.5, color: c.status === 'pagado' ? T.teal : T.coral, fontFamily: FONT_BODY, fontWeight: 600 }}>{c.status === 'pagado' ? 'Pagado' : 'Activo'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>{c.annualRate}% E.A. · {c.termMonths} cuotas</span>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 15, color: T.ink }}>{formatMoney(c.principal, c.currency === 'UVR' ? undefined : data.currency)}{c.currency === 'UVR' ? ' UVR' : ''}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CreditDetail({ data, actions, credit, setModal, onBack, onDeleted }) {
  const [payments, setPayments] = useState(null);
  const [extras, setExtras] = useState(null);
  const [insurances, setInsurances] = useState(null);
  const [showAll, setShowAll] = useState(false);

  async function refresh() {
    const [p, e, ins] = await Promise.all([actions.loadCreditPayments(credit.id), actions.loadCreditExtraPayments(credit.id), actions.loadCreditInsurances(credit.id)]);
    setPayments(p); setExtras(e); setInsurances(ins);
  }
  useEffect(() => { refresh(); }, [credit.id]);

  async function remove() {
    if (!confirm(`¿Eliminar el crédito "${credit.name}"? Se borrará también su tabla de amortización.`)) return;
    await actions.deleteCredit(credit.id);
    onDeleted();
  }
  async function removeInsurance(id) {
    if (!confirm('¿Eliminar este seguro? Se recalculará el valor de las cuotas pendientes.')) return;
    await actions.removeCreditInsurance(id, credit.id);
    await refresh();
  }

  const paidCount = payments?.filter((p) => p.paid).length || 0;
  const totalCount = payments?.length || 0;
  const nextUnpaid = payments?.find((p) => !p.paid);
  const currentBalance = payments?.length ? (payments.filter((p) => p.paid).slice(-1)[0]?.balanceAfter ?? credit.principal) : credit.principal;
  const money = (v) => credit.currency === 'UVR' ? `${v.toLocaleString('es-CO', { maximumFractionDigits: 2 })} UVR` : formatMoney(v, data.currency);

  const visiblePayments = showAll ? payments : payments?.slice(0, 6);
  const activeInsuranceTotal = (insurances || []).filter((i) => i.active && i.validFrom <= todayISO() && todayISO() <= i.validTo).reduce((s, i) => s + i.monthlyValue, 0);

  return (
    <div className="pb-4 pt-2">
      <button onClick={onBack} className="flex items-center gap-1 mb-3">
        <ChevronRight size={16} color={T.inkSoft} style={{ transform: 'rotate(180deg)' }} />
        <span style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }}>Créditos</span>
      </button>

      <Card style={{ marginBottom: 16 }}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: T.ink }}>{credit.name}</p>
            <p style={{ fontSize: 12, color: T.inkSoft }}>{CREDIT_TYPE_LABELS[credit.creditType] || 'Crédito'} · {credit.currency} · {credit.amortizationSystem === 'frances' ? 'Sistema francés' : 'Sistema alemán'}</p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton icon={Pencil} onClick={() => setModal({ type: 'editCredit', payload: { credit, payments }, onDone: refresh })} label="Editar crédito" />
            <IconButton icon={Trash2} variant="danger" onClick={remove} label="Eliminar crédito" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p style={{ fontSize: 11, color: T.inkSoft }}>Saldo actual</p>
            <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 17, color: T.ink }}>{money(currentBalance)}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: T.inkSoft }}>Progreso</p>
            <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 17, color: T.ink }}>{paidCount}/{totalCount} cuotas</p>
          </div>
        </div>
        <ProgressBar value={(paidCount / (totalCount || 1)) * 100} color={T.teal} />
        <div className="flex items-center gap-3 mt-3">
          <span className="flex items-center gap-1"><Percent size={12} color={T.inkSoft} /><span style={{ fontSize: 11.5, color: T.inkSoft }}>{credit.annualRate}% E.A.</span></span>
          {activeInsuranceTotal > 0 && <span className="flex items-center gap-1"><ShieldCheck size={12} color={T.inkSoft} /><span style={{ fontSize: 11.5, color: T.inkSoft }}>Seguros {money(activeInsuranceTotal)}/mes</span></span>}
        </div>
        {credit.status !== 'pagado' && (
          <div className="flex gap-2 mt-4">
            <GhostButton full onClick={() => setModal({ type: 'extraPayment', payload: { credit, payments }, onDone: refresh })}>Abono a capital</GhostButton>
            {nextUnpaid && <PrimaryButton full onClick={() => setModal({ type: 'payInstallment', payload: { credit, installment: nextUnpaid }, onDone: refresh })}>Pagar cuota {nextUnpaid.installmentNumber}</PrimaryButton>}
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className="flex items-center justify-between mb-2">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Seguros</p>
          <IconButton icon={Plus} onClick={() => setModal({ type: 'creditInsurance', payload: credit, onDone: refresh })} color={T.teal} label="Agregar seguro" />
        </div>
        {(!insurances || insurances.length === 0) && <p style={{ fontSize: 12, color: T.inkSoft }}>Sin seguros registrados. Agrega vida, incendio/terremoto (vivienda) o desempleo, con su vigencia.</p>}
        {insurances?.map((ins) => {
          const vigente = ins.active && ins.validFrom <= todayISO() && todayISO() <= ins.validTo;
          return (
            <div key={ins.id} className="flex items-center justify-between mb-2 rounded-xl p-2.5" style={{ background: vigente ? T.tealSoft : T.bg }}>
              <div>
                <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{INSURANCE_TYPE_LABELS[ins.type]}</p>
                <p style={{ fontSize: 10.5, color: T.inkSoft }}>{formatDate(ins.validFrom)} → {formatDate(ins.validTo)} · {money(ins.monthlyValue)}/mes{!vigente ? ' · vencido' : ''}</p>
              </div>
              <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeInsurance(ins.id)} label="Eliminar seguro" />
            </div>
          );
        })}
        <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Se suman a la cuota de cada mes cubierto por su vigencia. Al renovar (o si se endosa un valor distinto), agrega uno nuevo con la vigencia actualizada.</p>
      </Card>

      {extras?.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Abonos a capital</p>
          {extras.map((e) => (
            <div key={e.id} className="flex items-center justify-between mb-1.5">
              <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>{formatDate(e.appliedDate)} · {e.strategy === 'reducir_plazo' ? 'redujo plazo' : 'redujo cuota'} · {e.byName}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.teal }}>{money(e.amount)}</span>
            </div>
          ))}
        </Card>
      )}

      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Tabla de amortización</p>
      {!payments && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Cargando…</p>}
      <div className="flex flex-col gap-1.5">
        {visiblePayments?.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: p.paid ? T.tealSoft : T.surface, border: `1px solid ${p.paid ? T.tealSoft : T.border}` }}>
            <div>
              <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Cuota {p.installmentNumber} · {formatDate(p.dueDate)}</p>
              <p style={{ fontSize: 10.5, color: T.inkSoft }}>Capital {money(p.capital)} · Interés {money(p.interest)}{p.insurance > 0 ? ` · Seguro ${money(p.insurance)}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.ink }}>{money(p.total)}</span>
              {p.paid && <Check size={14} color={T.teal} />}
            </div>
          </div>
        ))}
      </div>
      {payments?.length > 6 && (
        <button onClick={() => setShowAll(!showAll)} className="mt-3 block mx-auto">
          <span style={{ fontSize: 12.5, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>{showAll ? 'Ver menos' : `Ver las ${payments.length} cuotas`}</span>
        </button>
      )}
    </div>
  );
}

function CreditModal({ data, actions, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [creditType, setCreditType] = useState('vivienda');
  const [currency, setCurrency] = useState('COP');
  const [defineBy, setDefineBy] = useState('total'); // total | installment
  const [principal, setPrincipal] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [amortizationSystem, setAmortizationSystem] = useState('frances');
  const [insuranceMonthly, setInsuranceMonthly] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [inProgress, setInProgress] = useState(false);
  const [installmentsAlreadyPaid, setInstallmentsAlreadyPaid] = useState('');
  const [uvr, setUvr] = useState(null);
  const [loadingUvr, setLoadingUvr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (defineBy === 'installment') setAmortizationSystem('frances'); }, [defineBy]);

  // deriva el monto total del préstamo a partir de la cuota fija (solo sistema francés)
  function derivePrincipalFromInstallment() {
    const cuota = parseFloat(installmentAmount), r = parseFloat(annualRate), t = parseInt(termMonths, 10);
    if (!cuota || !r || !t) return 0;
    const i = annualToMonthlyRate(r);
    return i === 0 ? cuota * t : (cuota * (1 - Math.pow(1 + i, -t))) / i;
  }
  const derivedPrincipal = defineBy === 'installment' ? derivePrincipalFromInstallment() : null;

  async function fetchUvr() {
    setLoadingUvr(true);
    try {
      const r = await actions.getLatestUvr();
      setUvr(r);
    } finally {
      setLoadingUvr(false);
    }
  }
  useEffect(() => { if (currency === 'UVR' && !uvr) fetchUvr(); }, [currency]);

  async function save() {
    const p = defineBy === 'installment' ? derivedPrincipal : parseFloat(principal);
    const r = parseFloat(annualRate), t = parseInt(termMonths, 10);
    if (!name.trim() || !p || !r || !t) { setError('Completa nombre, monto (o cuota), tasa y plazo.'); return; }
    setSaving(true); setError('');
    try {
      await actions.createCredit({
        name: name.trim(), creditType, currency, principal: p, annualRate: r, termMonths: t,
        amortizationSystem, insuranceMonthly: parseFloat(insuranceMonthly) || 0, startDate,
        ownerMemberId: ownerMemberId || null, accountId: accountId || null,
        installmentsAlreadyPaid: inProgress ? (parseInt(installmentsAlreadyPaid, 10) || 0) : 0,
      });
      onCreated?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo crear el crédito.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nuevo crédito" wide onClose={onClose}>
      <Field label="Nombre">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Crédito hipotecario" />
      </Field>
      <Field label="Tipo">
        <select style={inputStyle} value={creditType} onChange={(e) => setCreditType(e.target.value)}>
          {Object.entries(CREDIT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Moneda">
        <select style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="COP">COP — Pesos</option>
          <option value="UVR">UVR — Unidad de Valor Real</option>
        </select>
      </Field>
      {currency === 'UVR' && (
        <div className="rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
          {loadingUvr && <p style={{ fontSize: 12, color: T.teal }}>Consultando valor UVR…</p>}
          {uvr && <p style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY }}>UVR {formatDate(uvr.date)}: <b>${uvr.value.toLocaleString('es-CO')}</b> {uvr.cached ? '(último valor guardado)' : ''}</p>}
          {!uvr && !loadingUvr && <p style={{ fontSize: 12, color: T.danger }}>No se pudo obtener el valor UVR automáticamente. Ingresa el monto directamente en UVR; puedes registrar el valor del día en Ajustes.</p>}
        </div>
      )}
      <Field label="¿Cómo prefieres definirlo?">
        <div className="flex rounded-xl p-1" style={{ background: T.bg }}>
          <button type="button" onClick={() => setDefineBy('total')} className="flex-1 rounded-lg py-2" style={{ background: defineBy === 'total' ? T.surface : 'transparent', border: defineBy === 'total' ? `1px solid ${T.border}` : 'none' }}>
            <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Monto total</span>
          </button>
          <button type="button" onClick={() => setDefineBy('installment')} className="flex-1 rounded-lg py-2" style={{ background: defineBy === 'installment' ? T.surface : 'transparent', border: defineBy === 'installment' ? `1px solid ${T.border}` : 'none' }}>
            <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Valor de la cuota</span>
          </button>
        </div>
      </Field>
      {defineBy === 'total' ? (
        <Field label={`Monto del crédito (${currency})`}>
          <input style={inputStyle} type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0" />
        </Field>
      ) : (
        <Field label={`Valor de la cuota (${currency}) — sistema francés`}>
          <input style={inputStyle} type="number" value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} placeholder="0" />
        </Field>
      )}
      <Field label="Tasa efectiva anual (E.A. %)">
        <input style={inputStyle} type="number" step="0.01" value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} placeholder="Ej. 24.5" />
      </Field>
      <Field label="Plazo (meses)">
        <input style={inputStyle} type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} placeholder="Ej. 180" />
      </Field>
      {defineBy === 'installment' && derivedPrincipal > 0 && (
        <div className="rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
          <p style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY }}>Monto del préstamo calculado: <b>{formatMoney(derivedPrincipal, currency === 'UVR' ? undefined : currency)}{currency === 'UVR' ? ' UVR' : ''}</b></p>
        </div>
      )}
      {defineBy === 'total' && (
        <Field label="Sistema de amortización">
          <select style={inputStyle} value={amortizationSystem} onChange={(e) => setAmortizationSystem(e.target.value)}>
            <option value="frances">Francés (cuota fija)</option>
            <option value="aleman">Alemán (abono a capital fijo)</option>
          </select>
        </Field>
      )}
      <Field label="Seguros mensuales (opcional)">
        <input style={inputStyle} type="number" value={insuranceMonthly} onChange={(e) => setInsuranceMonthly(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Fecha de inicio">
        <input style={inputStyle} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={inProgress} onChange={(e) => setInProgress(e.target.checked)} />
        <span style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY }}>Este crédito ya está en curso (ya pagué algunas cuotas)</span>
      </label>
      {inProgress && (
        <Field label="Cuotas ya pagadas">
          <input style={inputStyle} type="number" value={installmentsAlreadyPaid} onChange={(e) => setInstallmentsAlreadyPaid(e.target.value)} placeholder="Ej. 12" />
        </Field>
      )}
      {inProgress && (
        <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
          Generamos la tabla completa según el monto, tasa y plazo originales, y marcamos como pagadas las primeras {installmentsAlreadyPaid || 'N'} cuotas — sin crear gastos retroactivos en Movimientos.
        </p>
      )}
      <Field label="Responsable">
        <select style={inputStyle} value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
          <option value="">Compartido por todo el hogar</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>Solo {m.name} (privado)</option>)}
        </select>
      </Field>
      <Field label="Cuenta desde donde se paga">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Creando…' : 'Crear crédito y generar tabla de amortización'}</PrimaryButton>
    </Modal>
  );
}

function PayInstallmentModal({ data, actions, payload, onClose, onDone }) {
  const { credit, installment } = payload;
  const [accountId, setAccountId] = useState(credit.accountId || data.accounts[0]?.id || '');
  const [memberId, setMemberId] = useState(credit.ownerMemberId || data.members[0]?.id || '');
  const deudasCat = data.categories.find((c) => c.name === 'Deudas y préstamos')?.id || data.categories.find((c) => c.type === 'expense')?.id;
  const [saving, setSaving] = useState(false);
  const money = (v) => credit.currency === 'UVR' ? `${v.toLocaleString('es-CO', { maximumFractionDigits: 2 })} UVR` : formatMoney(v, data.currency);

  async function confirm() {
    setSaving(true);
    try {
      await actions.markInstallmentPaid(credit, installment, accountId, memberId, deudasCat);
      onDone?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Pagar cuota ${installment.installmentNumber}`} onClose={onClose}>
      <div className="rounded-xl p-3 mb-4" style={{ background: T.bg }}>
        <p style={{ fontSize: 12.5, color: T.inkSoft }} className="mb-1">Vence {formatDate(installment.dueDate)}</p>
        <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 20, color: T.ink }}>{money(installment.total)}</p>
        <p style={{ fontSize: 11, color: T.inkSoft }}>Capital {money(installment.capital)} · Interés {money(installment.interest)}{installment.insurance > 0 ? ` · Seguro ${money(installment.insurance)}` : ''}</p>
      </div>
      <Field label="Cuenta de pago">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Integrante que paga">
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-4">Esto registrará automáticamente un gasto en "Deudas y préstamos".</p>
      <PrimaryButton full onClick={confirm}>{saving ? 'Guardando…' : 'Confirmar pago'}</PrimaryButton>
    </Modal>
  );
}

function ExtraPaymentModal({ data, actions, payload, onClose, onDone }) {
  const { credit, payments } = payload;
  const [amount, setAmount] = useState('');
  const [strategy, setStrategy] = useState('reducir_plazo');
  const [applyDate, setApplyDate] = useState(todayISO());
  const [registerAsExpense, setRegisterAsExpense] = useState(true);
  const [accountId, setAccountId] = useState(credit.accountId || data.accounts[0]?.id || '');
  const [memberId, setMemberId] = useState(credit.ownerMemberId || data.members[0]?.id || '');
  const deudasCat = data.categories.find((c) => c.name === 'Deudas y préstamos')?.id || data.categories.find((c) => c.type === 'expense')?.id;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Ingresa un monto válido.'); return; }
    setSaving(true); setError('');
    try {
      await actions.applyExtraPayment(credit, payments, amt, strategy, applyDate, accountId, memberId, deudasCat, registerAsExpense);
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo aplicar el abono.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Abono a capital" onClose={onClose}>
      <Field label={`Monto del abono (${credit.currency})`}>
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Fecha del abono">
        <input style={inputStyle} type="date" value={applyDate} onChange={(e) => setApplyDate(e.target.value)} />
      </Field>
      <Field label="¿Qué prefieres?">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 rounded-xl p-3" style={{ background: strategy === 'reducir_plazo' ? T.tealSoft : T.bg, border: `1px solid ${strategy === 'reducir_plazo' ? T.teal : T.border}` }}>
            <input type="radio" checked={strategy === 'reducir_plazo'} onChange={() => setStrategy('reducir_plazo')} />
            <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>Reducir el plazo (misma cuota, terminas antes)</span>
          </label>
          <label className="flex items-center gap-2 rounded-xl p-3" style={{ background: strategy === 'reducir_cuota' ? T.tealSoft : T.bg, border: `1px solid ${strategy === 'reducir_cuota' ? T.teal : T.border}` }}>
            <input type="radio" checked={strategy === 'reducir_cuota'} onChange={() => setStrategy('reducir_cuota')} />
            <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>Reducir el valor de la cuota (mismo plazo)</span>
          </label>
        </div>
      </Field>
      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={registerAsExpense} onChange={(e) => setRegisterAsExpense(e.target.checked)} />
        <span style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>Registrar este abono como gasto en Movimientos</span>
      </label>
      {registerAsExpense && (
        <>
          <Field label="Cuenta de pago">
            <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Integrante que aporta">
            <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        </>
      )}
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Aplicando…' : 'Aplicar abono y recalcular'}</PrimaryButton>
    </Modal>
  );
}

function EditCreditModal({ data, actions, payload, onClose, onDone }) {
  const { credit, payments } = payload;
  const [name, setName] = useState(credit.name);
  const [creditType, setCreditType] = useState(credit.creditType);
  const [annualRate, setAnnualRate] = useState(String(credit.annualRate));
  const [termMonths, setTermMonths] = useState(String(credit.termMonths));
  const [amortizationSystem, setAmortizationSystem] = useState(credit.amortizationSystem);
  const [ownerMemberId, setOwnerMemberId] = useState(credit.ownerMemberId || '');
  const [accountId, setAccountId] = useState(credit.accountId || data.accounts[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const paidCount = payments.filter((p) => p.paid).length;
  const willRecalc = parseFloat(annualRate) !== credit.annualRate || parseInt(termMonths, 10) !== credit.termMonths || amortizationSystem !== credit.amortizationSystem;

  async function save() {
    const r = parseFloat(annualRate), t = parseInt(termMonths, 10);
    if (!name.trim() || !r || !t) { setError('Completa nombre, tasa y plazo.'); return; }
    if (t < paidCount) { setError(`El plazo no puede ser menor a las ${paidCount} cuotas que ya están pagadas.`); return; }
    if (willRecalc && !confirm('Esto recalculará las cuotas pendientes (las ya pagadas no se tocan). ¿Continuar?')) return;
    setSaving(true); setError('');
    try {
      await actions.updateCredit(credit.id, {
        name: name.trim(), creditType, annualRate: r, termMonths: t, amortizationSystem,
        ownerMemberId: ownerMemberId || null, accountId: accountId || null,
      }, credit, payments);
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo actualizar el crédito.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar crédito" onClose={onClose}>
      <Field label="Nombre">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Tipo">
        <select style={inputStyle} value={creditType} onChange={(e) => setCreditType(e.target.value)}>
          {Object.entries(CREDIT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Tasa efectiva anual (E.A. %)">
        <input style={inputStyle} type="number" step="0.01" value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} />
      </Field>
      <Field label={`Plazo total (meses) — ya pagaste ${paidCount}`}>
        <input style={inputStyle} type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
      </Field>
      <Field label="Sistema de amortización">
        <select style={inputStyle} value={amortizationSystem} onChange={(e) => setAmortizationSystem(e.target.value)}>
          <option value="frances">Francés (cuota fija)</option>
          <option value="aleman">Alemán (abono a capital fijo)</option>
        </select>
      </Field>
      <Field label="Responsable">
        <select style={inputStyle} value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
          <option value="">Compartido por todo el hogar</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>Solo {m.name} (privado)</option>)}
        </select>
      </Field>
      <Field label="Cuenta desde donde se paga">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {willRecalc && (
        <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.amberSoft }}>
          <Info size={14} color={T.amber} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 11.5, color: T.ink, fontFamily: FONT_BODY }}>Cambiaste la tasa, el plazo o el sistema — las cuotas pendientes se recalcularán desde el saldo actual. Las ya pagadas no cambian.</p>
        </div>
      )}
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Guardar cambios'}</PrimaryButton>
    </Modal>
  );
}

function CreditInsuranceModal({ data, actions, payload: credit, onClose, onDone }) {
  const [type, setType] = useState('vida');
  const [monthlyValue, setMonthlyValue] = useState('');
  const [validFrom, setValidFrom] = useState(todayISO());
  const [validTo, setValidTo] = useState(addOneYear(todayISO()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const v = parseFloat(monthlyValue);
    if (!v || !validFrom || !validTo) { setError('Completa el valor mensual y la vigencia.'); return; }
    setSaving(true); setError('');
    try {
      await actions.addCreditInsurance(credit.id, { type, monthlyValue: v, validFrom, validTo });
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo agregar el seguro.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Agregar seguro" onClose={onClose}>
      <Field label="Tipo de seguro">
        <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(INSURANCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label={`Valor mensual (${credit.currency})`}>
        <input style={inputStyle} type="number" value={monthlyValue} onChange={(e) => setMonthlyValue(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Vigente desde">
        <input style={inputStyle} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </Field>
      <Field label="Vigente hasta (renovación)">
        <input style={inputStyle} type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
      </Field>
      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Cuando cambie el valor (renovación o endoso), agrega un seguro nuevo con la vigencia actualizada en vez de editar este.</p>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Agregar seguro'}</PrimaryButton>
    </Modal>
  );
}

function MemberTransferModal({ data, actions, onClose }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [fromMemberId, setFromMemberId] = useState(data.members[0]?.id || '');
  const [fromAccountId, setFromAccountId] = useState(data.accounts[0]?.id || '');
  const [toMemberId, setToMemberId] = useState(data.members[1]?.id || data.members[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(data.accounts[0]?.id || '');
  const [date, setDate] = useState(todayISO());
  const [settlesDebt, setSettlesDebt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Ingresa un monto válido.'); return; }
    if (fromMemberId === toMemberId && fromAccountId === toAccountId) { setError('Elige un integrante o cuenta de destino distinto.'); return; }
    setSaving(true); setError('');
    try {
      await actions.addMemberTransfer({ amount: amt, description, fromMemberId, fromAccountId, toMemberId, toAccountId, date, settlesDebt });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo registrar la transferencia.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Transferencia entre integrantes" onClose={onClose}>
      <Field label="Descripción (opcional)">
        <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Mesada, préstamo entre hermanos…" />
      </Field>
      <Field label="Monto">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="De (integrante)">
        <select style={inputStyle} value={fromMemberId} onChange={(e) => setFromMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Desde la cuenta">
        <select style={inputStyle} value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Para (integrante)">
        <select style={inputStyle} value={toMemberId} onChange={(e) => setToMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Hacia la cuenta">
        <select style={inputStyle} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha">
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <label className="flex items-start gap-2 mb-4 rounded-xl p-3" style={{ background: settlesDebt ? T.tealSoft : T.bg }}>
        <input type="checkbox" checked={settlesDebt} onChange={(e) => setSettlesDebt(e.target.checked)} style={{ marginTop: 2 }} />
        <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>Esta transferencia salda una deuda de gastos compartidos (afecta el balance en Conciliación)</span>
      </label>
      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">No cuenta como ingreso ni gasto, pero sí se refleja en tu balance personal. Marca la casilla solo si además está pagando una deuda de un gasto compartido.</p>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Registrar transferencia'}</PrimaryButton>
    </Modal>
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
