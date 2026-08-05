import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Home, List, Target, PiggyBank, Users, Settings, ArrowLeftRight, Wallet,
  TrendingUp, TrendingDown, X, Check, AlertTriangle, Star, Repeat, Calendar,
  Trash2, Pencil, ChevronRight, Plus, DollarSign, Landmark, Sparkles, ArrowRight,
  MessageCircle, Camera, Loader2, Image as ImageIcon, Info, LogOut, QrCode, Copy, UserPlus, History, CreditCard, Percent, ShieldCheck
} from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from 'recharts';
import { supabase } from './lib/supabaseClient';
import * as db from './lib/db';

/* ---------------------------------------------------------------------- */
/* TOKENS DE DISEÑO                                                        */
/* ---------------------------------------------------------------------- */
const T = {
  bg: '#F3F5F1',
  surface: '#FFFFFF',
  ink: '#1B2B3A',
  inkSoft: '#5B6B76',
  border: '#DFE3DC',
  teal: '#2F6E68',
  tealSoft: '#E4EFEC',
  coral: '#E0673F',
  coralSoft: '#FBE9E2',
  gold: '#B98A22',
  goldSoft: '#F5EBD3',
  danger: '#C1443A',
};
const MEMBER_COLORS = ['#2F6E68', '#E0673F', '#5B7FA6', '#B98A22', '#8E5B9F', '#4A9B6E', '#B5533C', '#3D6B8C'];
const FONT_DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const FONT_BODY = "'Inter', system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";

const CURRENCIES = [
  { code: 'USD', label: 'USD - Dólar' },
  { code: 'MXN', label: 'MXN - Peso mexicano' },
  { code: 'COP', label: 'COP - Peso colombiano' },
  { code: 'ARS', label: 'ARS - Peso argentino' },
  { code: 'PEN', label: 'PEN - Sol peruano' },
  { code: 'CLP', label: 'CLP - Peso chileno' },
  { code: 'EUR', label: 'EUR - Euro' },
];

const DEFAULT_CATEGORIES = [
  { id: 'cat-salario', name: 'Salario', type: 'income', icon: '💼' },
  { id: 'cat-negocio', name: 'Negocio / Freelance', type: 'income', icon: '🧾' },
  { id: 'cat-rentas', name: 'Rentas', type: 'income', icon: '🏠' },
  { id: 'cat-inv-in', name: 'Inversiones', type: 'income', icon: '📈' },
  { id: 'cat-otro-in', name: 'Otros ingresos', type: 'income', icon: '➕' },
  { id: 'cat-vivienda', name: 'Vivienda', type: 'expense', icon: '🏠' },
  { id: 'cat-alimentacion', name: 'Alimentación', type: 'expense', icon: '🍎' },
  { id: 'cat-transporte', name: 'Transporte', type: 'expense', icon: '🚗' },
  { id: 'cat-salud', name: 'Salud', type: 'expense', icon: '⚕️' },
  { id: 'cat-educacion', name: 'Educación', type: 'expense', icon: '🎓' },
  { id: 'cat-ocio', name: 'Ocio y entretenimiento', type: 'expense', icon: '🎬' },
  { id: 'cat-ropa', name: 'Ropa', type: 'expense', icon: '👕' },
  { id: 'cat-servicios', name: 'Servicios (luz/agua/internet)', type: 'expense', icon: '💡' },
  { id: 'cat-deudas', name: 'Deudas y préstamos', type: 'expense', icon: '💳' },
  { id: 'cat-ahorro', name: 'Ahorro / Inversión', type: 'expense', icon: '🐷' },
  { id: 'cat-otro-ex', name: 'Otros gastos', type: 'expense', icon: '➖' },
];

const STORAGE_KEY = 'hf-data-v1';

/* ---------------------------------------------------------------------- */
/* UTILIDADES                                                              */
/* ---------------------------------------------------------------------- */
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (d) => (d || todayISO()).slice(0, 7);
const thisMonthKey = () => monthKey(todayISO());

function formatMoney(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0);
  } catch {
    return `$${Math.round(amount || 0).toLocaleString('es-ES')}`;
  }
}
function formatDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysUntil(d) {
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(d + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

function getNextOccurrence(t) {
  const today = new Date(todayISO() + 'T00:00:00');
  let d = new Date(t.date + 'T00:00:00');
  if (t.frequency === 'semanal') {
    while (d < today) d.setDate(d.getDate() + 7);
  } else if (t.frequency === 'quincenal') {
    while (d < today) d.setDate(d.getDate() + 14);
  } else if (t.frequency === 'anual') {
    while (d < today) d.setFullYear(d.getFullYear() + 1);
  } else {
    // mensual
    while (d < today) d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

function occurrencesInMonth(t, mKey) {
  // cuántas veces cae una transacción recurrente en el mes dado
  if (!t.recurring) return t.date && monthKey(t.date) === mKey ? 1 : 0;
  const [y, m] = mKey.split('-').map(Number);
  const start = new Date(t.date + 'T00:00:00');
  if (t.frequency === 'anual') {
    return start.getMonth() + 1 === m ? 1 : 0;
  }
  if (start > new Date(y, m, 0)) return 0; // aún no inicia ese mes
  if (t.frequency === 'mensual') return 1;
  if (t.frequency === 'quincenal') return 2;
  if (t.frequency === 'semanal') return 4;
  return 1;
}

function computeBalances(transactions, members) {
  const bal = {};
  members.forEach((m) => (bal[m.id] = 0));
  transactions.forEach((t) => {
    if (t.type === 'settlement') {
      bal[t.from] = (bal[t.from] || 0) + t.amount;
      bal[t.to] = (bal[t.to] || 0) - t.amount;
      return;
    }
    if (t.type === 'expense' && t.isShared && t.participants?.length) {
      const payerShare = t.participants.find((p) => p.memberId === t.memberId)?.share || 0;
      bal[t.memberId] = (bal[t.memberId] || 0) + (t.amount - payerShare);
      t.participants.forEach((p) => {
        if (p.memberId !== t.memberId) bal[p.memberId] = (bal[p.memberId] || 0) - p.share;
      });
    }
  });
  return bal;
}

function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  Object.entries(balances).forEach(([id, v]) => {
    if (v > 0.5) creditors.push({ id, v });
    else if (v < -0.5) debtors.push({ id, v: -v });
  });
  creditors.sort((a, b) => b.v - a.v);
  debtors.sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(amt * 100) / 100 });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v < 0.5) i++;
    if (creditors[j].v < 0.5) j++;
  }
  return transfers;
}

function goalPriorityScore(goal) {
  const votes = Object.values(goal.votes || {});
  if (!votes.length) return 2;
  return votes.reduce((a, b) => a + b, 0) / votes.length;
}
const PRIORITY_LABEL = { 3: 'Alta', 2: 'Media', 1: 'Baja' };

/* ---------------------------------------------------------------------- */
/* COMPONENTES DE UI GENÉRICOS                                             */
/* ---------------------------------------------------------------------- */
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(27,43,58,0.45)' }} onClick={onClose}>
      <div
        className={`w-full ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} bg-white rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto`}
        style={{ background: T.surface }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: T.border }}>
          <h3 style={{ fontFamily: FONT_DISPLAY, color: T.ink }} className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5">
            <X size={20} color={T.inkSoft} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm mb-1.5" style={{ color: T.inkSoft, fontFamily: FONT_BODY }}>{label}</span>
      {children}
    </label>
  );
}
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border}`,
  fontFamily: FONT_BODY, fontSize: 15, color: T.ink, background: '#FCFCFA', outline: 'none',
};

function PrimaryButton({ children, onClick, style, type = 'button', full }) {
  return (
    <button type={type} onClick={onClick}
      className={`${full ? 'w-full' : ''} rounded-xl font-medium transition-transform active:scale-[0.98]`}
      style={{ background: T.teal, color: '#fff', padding: '11px 18px', fontFamily: FONT_BODY, fontSize: 15, ...style }}>
      {children}
    </button>
  );
}
function GhostButton({ children, onClick, style, full }) {
  return (
    <button onClick={onClick}
      className={`${full ? 'w-full' : ''} rounded-xl font-medium`}
      style={{ background: 'transparent', color: T.ink, border: `1px solid ${T.border}`, padding: '10px 18px', fontFamily: FONT_BODY, fontSize: 15, ...style }}>
      {children}
    </button>
  );
}

function Card({ children, style }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}`, ...style }}>
      {children}
    </div>
  );
}

function ProgressBar({ value, color = T.teal, bg = '#EDEFE9', height = 8 }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ width: '100%', height, borderRadius: height, background: bg, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: height, transition: 'width .4s ease' }} />
    </div>
  );
}

function MemberChip({ member, size = 24 }) {
  if (!member) return null;
  return (
    <div className="inline-flex items-center gap-1.5">
      <div style={{ width: size, height: size, borderRadius: '50%', background: member.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, fontFamily: FONT_DISPLAY, fontWeight: 700 }}>
        {member.name.slice(0, 1).toUpperCase()}
      </div>
      <span style={{ fontFamily: FONT_BODY, fontSize: 14, color: T.ink }}>{member.name}</span>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      <div className="mb-3" style={{ opacity: 0.5 }}>{icon}</div>
      <p style={{ fontFamily: FONT_DISPLAY, color: T.ink, fontSize: 16 }} className="font-semibold">{title}</p>
      <p style={{ fontFamily: FONT_BODY, color: T.inkSoft, fontSize: 13.5 }} className="mt-1 max-w-xs">{subtitle}</p>
    </div>
  );
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
        <Field label="Nueva contraseña">
          <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <Field label="Confirmar contraseña">
          <input style={inputStyle} type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••" />
        </Field>
        {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
        <PrimaryButton full onClick={save}>{loading ? 'Guardando…' : 'Guardar nueva contraseña'}</PrimaryButton>
      </Card>
    </AuthShell>
  );
}

function LoadingScreen() {
  return (
    <div style={{ background: T.bg, minHeight: '100vh' }} className="flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');`}</style>
      <p style={{ fontFamily: FONT_BODY, color: T.inkSoft }}>Cargando…</p>
    </div>
  );
}

function AuthShell({ children }) {
  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: FONT_BODY }} className="flex flex-col items-center px-5 py-10">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');`}</style>
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
          <Field label="Contraseña">
            <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
        )}
        {mode === 'signup' && (
          <Field label="Confirmar contraseña">
            <input style={inputStyle} type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••" />
          </Field>
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

  async function refresh() {
    const d = await db.loadHouseholdData(household.householdId);
    setRaw(d);
  }
  useEffect(() => { refresh().finally(() => setLoading(false)); }, [household.householdId]);

  if (loading || !raw) return <LoadingScreen />;

  const data = {
    householdName: householdMeta?.name || '',
    currency: householdMeta?.currency || 'COP',
    viewMode, activeMemberId,
    members: raw.members, categories: raw.categories, accounts: raw.accounts,
    transactions: raw.transactions, goals: raw.goals, budgets: raw.budgets,
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
    contributeGoal: wrap((goal, amount, memberId, accountId) => {
      const ahorroCat = data.categories.find((c) => c.name === 'Ahorro / Inversión')?.id || data.categories.find((c) => c.type === 'expense')?.id;
      return db.contributeGoal(household.householdId, session.user.id, goal, amount, memberId, accountId, ahorroCat);
    }),
    addBudget: wrap((b) => db.addBudget(household.householdId, b)),
    removeBudget: wrap((id) => db.removeBudget(id)),
    addAccount: wrap((a) => db.addAccount(household.householdId, a)),
    removeAccount: wrap((id) => db.removeAccount(id)),
    addCategory: wrap((c) => db.addCategory(household.householdId, c)),
    removeCategory: wrap((id) => db.removeCategory(id)),
    createInvite: () => db.createInvite(household.householdId, session.user.id),
    leaveHousehold: async () => { await db.leaveHousehold(household.householdId, session.user.id); onLeftHousehold(); },
    signOut: () => db.signOut(),
    // créditos
    loadCredits: () => db.loadCredits(household.householdId),
    loadCreditPayments: (creditId) => db.loadCreditPayments(creditId),
    loadCreditExtraPayments: (creditId) => db.loadCreditExtraPayments(creditId),
    createCredit: (credit) => db.createCredit(household.householdId, session.user.id, credit),
    deleteCredit: (id) => db.deleteCredit(id),
    markInstallmentPaid: (credit, installment, accountId, memberId, categoryId) =>
      db.markInstallmentPaid(household.householdId, session.user.id, credit, installment, accountId, memberId, categoryId),
    applyExtraPayment: (credit, payments, extraAmount, strategy, applyDate, accountId, memberId, categoryId, registerAsExpense) =>
      db.applyExtraPayment(household.householdId, session.user.id, credit, payments, extraAmount, strategy, applyDate, accountId, memberId, categoryId, registerAsExpense),
    getLatestUvr: () => db.getLatestUvr(),
    saveManualUvr: (date, value) => db.saveManualUvr(date, value),
  };

  return <MainApp data={data} update={update} actions={actions} />;
}

/* ---------------------------------------------------------------------- */
/* MAIN APP                                                                */
/* ---------------------------------------------------------------------- */
const TABS = [
  { id: 'dashboard', label: 'Inicio', icon: Home },
  { id: 'rapido', label: 'Registro rápido', icon: MessageCircle },
  { id: 'movimientos', label: 'Movimientos', icon: List },
  { id: 'creditos', label: 'Créditos', icon: CreditCard },
  { id: 'objetivos', label: 'Objetivos', icon: Target },
  { id: 'presupuestos', label: 'Presupuestos', icon: PiggyBank },
  { id: 'conciliacion', label: 'Conciliación', icon: ArrowLeftRight },
  { id: 'cuentas', label: 'Cuentas', icon: Landmark },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
];

function MainApp({ data, update, actions }) {
  const [tab, setTab] = useState('dashboard');
  const [modal, setModal] = useState(null); // {type: 'transaction'|'goal'|'invite'|'account'|'budget'|'vote'|'contribute'|'category', payload}

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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');`}</style>

      {/* Header */}
      <div className="px-5 pt-6 pb-4 sticky top-0 z-10" style={{ background: T.bg }}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 20, color: T.ink }}>{data.householdName}</p>
            <p style={{ color: T.inkSoft, fontSize: 12.5 }}>{data.members.length} integrantes · {currency}</p>
          </div>
          <div className="flex items-center gap-2">
            <ViewModeToggle data={data} update={update} />
            <button onClick={actions.signOut} title="Cerrar sesión" className="p-2 rounded-full" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <LogOut size={16} color={T.inkSoft} />
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
        {tab === 'dashboard' && <Dashboard data={data} update={update} actions={actions} visibleTransactions={visibleTransactions} visibleMemberId={visibleMemberId} setModal={setModal} setTab={setTab} />}
        {tab === 'rapido' && <QuickCapture data={data} actions={actions} setModal={setModal} />}
        {tab === 'movimientos' && <Movimientos data={data} actions={actions} visibleTransactions={visibleTransactions} setModal={setModal} />}
        {tab === 'creditos' && <Creditos data={data} actions={actions} setModal={setModal} />}
        {tab === 'objetivos' && <Objetivos data={data} actions={actions} setModal={setModal} />}
        {tab === 'presupuestos' && <Presupuestos data={data} actions={actions} setModal={setModal} />}
        {tab === 'conciliacion' && <Conciliacion data={data} actions={actions} />}
        {tab === 'cuentas' && <Cuentas data={data} actions={actions} setModal={setModal} />}
        {tab === 'ajustes' && <Ajustes data={data} update={update} actions={actions} setModal={setModal} />}
      </div>

      {/* Nav inferior */}
      <div className="fixed bottom-0 left-0 right-0 z-20" style={{ background: T.surface, borderTop: `1px solid ${T.border}` }}>
        <div className="flex justify-between px-2 py-2 overflow-x-auto">
          {TABS.map((tItem) => {
            const Icon = tItem.icon;
            const active = tab === tItem.id;
            return (
              <button key={tItem.id} onClick={() => setTab(tItem.id)} className="flex flex-col items-center gap-0.5 px-2 py-1 flex-shrink-0" style={{ minWidth: 56 }}>
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
      {modal?.type === 'invite' && <InviteModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'account' && <AccountModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'budget' && <BudgetModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'vote' && <VoteModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'contribute' && <ContributeModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} />}
      {modal?.type === 'category' && <CategoryModal data={data} actions={actions} onClose={() => setModal(null)} />}
      {modal?.type === 'credit' && <CreditModal data={data} actions={actions} onClose={() => setModal(null)} onCreated={modal.onCreated} />}
      {modal?.type === 'extraPayment' && <ExtraPaymentModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
      {modal?.type === 'payInstallment' && <PayInstallmentModal data={data} actions={actions} payload={modal.payload} onClose={() => setModal(null)} onDone={modal.onDone} />}
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
      if (t.type === 'settlement') return;
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

  let income = 0, expense = 0;
  visibleTransactions.forEach((t) => {
    if (t.type === 'settlement') return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    if (t.type === 'income') income += t.amount * occ;
    else expense += t.amount * occ;
  });
  const balance = income - expense;

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
            <span style={{ fontSize: 11, color: T.inkSoft }}>Ingresos {formatMoney(personalTotals.income, currency)} · Gastos {formatMoney(personalTotals.expense, currency)}</span>
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
      </Card>

      {budgetAlerts.length > 0 && (
        <Card style={{ marginBottom: 16, background: T.goldSoft, border: 'none' }}>
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} color={T.gold} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Presupuestos por vencer</span></div>
          {budgetAlerts.map((b) => {
            const cat = data.categories.find((c) => c.id === b.categoryId);
            return <p key={b.id} style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-0.5">
              {cat?.icon} {cat?.name}: usaste {Math.round(b.pct)}% ({formatMoney(b.spent, currency)} de {formatMoney(b.limit, currency)})
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
                  <span>{cat?.icon}</span>
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
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {catData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => formatMoney(v, currency)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1 mt-1">
            {catData.slice(0, 5).map((c, i) => (
              <div key={c.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div style={{ width: 8, height: 8, borderRadius: 4, background: pieColors[i % pieColors.length] }} /><span style={{ fontSize: 12.5, color: T.inkSoft }}>{c.icon} {c.name}</span></div>
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
          const cat = data.categories.find((c) => c.id === t.categoryId);
          const member = data.members.find((m) => m.id === t.memberId);
          const account = data.accounts.find((a) => a.id === t.accountId);
          return (
            <Card key={t.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: t.type === 'income' ? T.tealSoft : T.coralSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
                    {cat?.icon || '💰'}
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
                    <button onClick={() => setModal({ type: 'editTransaction', payload: t })}><Pencil size={14} color={T.inkSoft} /></button>
                    <button onClick={() => removeTransaction(t.id)}><Trash2 size={14} color={T.inkSoft} /></button>
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

async function callClaude({ system, content }) {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, content }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error);
  const text = (json.content || []).map((b) => b.text || '').join('\n');
  return JSON.parse(stripJsonFences(text));
}

function QuickCapture({ data, update, setModal }) {
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
      const parsed = await callClaude({ system, content: [{ type: 'text', text }] });
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
      const parsed = await callClaude({
        system,
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: 'Extrae los datos de este recibo.' },
        ],
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

  const cats = data.categories.filter((c) => c.type === type);
  useEffect(() => { if (!categoryId && cats.length) setCategoryId(cats[0].id); }, [type]);

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !categoryId || !accountId || !memberId) return;
    let participantsData = null;
    if (type === 'expense' && isShared && participants.length) {
      const share = amt / participants.length;
      participantsData = participants.map((id) => ({ memberId: id, share }));
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
          {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
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
            <Field label="Se divide entre (partes iguales)">
              <div className="flex flex-col gap-1.5">
                {data.members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={participants.includes(m.id)} onChange={() => toggleParticipant(m.id)} />
                    <MemberChip member={m} size={18} />
                  </label>
                ))}
              </div>
            </Field>
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
          {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
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
  const sorted = [...data.goals].sort((a, b) => goalPriorityScore(b) - goalPriorityScore(a));

  function removeGoal(id) { actions.removeGoal(id); }

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Objetivos de compra</p>
        <PrimaryButton onClick={() => setModal({ type: 'goal' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nuevo</PrimaryButton>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Cada integrante puede votar la prioridad de cada objetivo. El orden se calcula con el promedio de votos.
      </p>

      {sorted.length === 0 && <EmptyState icon={<Target size={36} color={T.teal} />} title="Sin objetivos aún" subtitle="Crea una meta de compra, como 'Vacaciones' o 'Nuevo refrigerador'." />}

      <div className="flex flex-col gap-3">
        {sorted.map((g) => {
          const score = goalPriorityScore(g);
          const pct = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
          const votesCount = Object.keys(g.votes || {}).length;
          return (
            <Card key={g.id}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: T.ink }}>{g.name}</p>
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
              <div className="flex gap-2 mt-3">
                <GhostButton onClick={() => setModal({ type: 'vote', payload: g })} style={{ flex: 1, fontSize: 12.5, padding: '8px' }}>Votar prioridad</GhostButton>
                <PrimaryButton onClick={() => setModal({ type: 'contribute', payload: g })} style={{ flex: 1, fontSize: 12.5, padding: '8px' }}>Aportar</PrimaryButton>
                <button onClick={() => removeGoal(g.id)}><Trash2 size={16} color={T.inkSoft} /></button>
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
  async function save() {
    if (!name.trim() || !parseFloat(targetAmount)) return;
    await actions.addGoal({ name: name.trim(), targetAmount: parseFloat(targetAmount), targetDate: targetDate || null });
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
  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    await actions.contributeGoal(goal, amt, memberId, accountId);
    onClose();
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
      <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-4">Esto se registrará también como un gasto en la categoría "Ahorro / Inversión".</p>
      <PrimaryButton full onClick={save}>Confirmar aporte</PrimaryButton>
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

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Presupuestos mensuales</p>
        <PrimaryButton onClick={() => setModal({ type: 'budget' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nuevo</PrimaryButton>
      </div>

      {data.budgets.length === 0 && <EmptyState icon={<PiggyBank size={36} color={T.teal} />} title="Sin presupuestos" subtitle="Define límites mensuales por categoría para recibir alertas antes de excederte." />}

      <div className="flex flex-col gap-3">
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
                <span style={{ fontFamily: FONT_BODY, fontWeight: 500, fontSize: 14, color: T.ink }}>{cat?.icon} {cat?.name}</span>
                <button onClick={() => removeBudget(b.id)}><Trash2 size={14} color={T.inkSoft} /></button>
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
    </div>
  );
}

function BudgetModal({ data, actions, onClose }) {
  const expenseCats = data.categories.filter((c) => c.type === 'expense');
  const [categoryId, setCategoryId] = useState(expenseCats[0]?.id || '');
  const [limit, setLimit] = useState('');
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
          {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
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
function Conciliacion({ data, actions }) {
  const currency = data.currency;
  const balances = useMemo(() => computeBalances(data.transactions, data.members), [data.transactions, data.members]);
  const transfers = useMemo(() => simplifyDebts(balances), [balances]);

  function settle(transfer) {
    actions.addSettlement(transfer.from, transfer.to, transfer.amount);
  }

  const sharedExpensesCount = data.transactions.filter((t) => t.isShared).length;

  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-1">Conciliación de gastos compartidos</p>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Calculado a partir de {sharedExpensesCount} gasto(s) compartido(s). Muestra las transferencias mínimas para saldar cuentas entre integrantes.
      </p>

      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Balance individual</p>
        {data.members.map((m) => {
          const b = balances[m.id] || 0;
          return (
            <div key={m.id} className="flex items-center justify-between mb-2">
              <MemberChip member={m} />
              <span style={{ fontFamily: FONT_MONO, fontSize: 13.5, color: b > 0.5 ? T.teal : b < -0.5 ? T.danger : T.inkSoft }}>
                {b > 0.5 ? `Le deben ${formatMoney(b, currency)}` : b < -0.5 ? `Debe ${formatMoney(-b, currency)}` : 'En paz'}
              </span>
            </div>
          );
        })}
      </Card>

      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Transferencias sugeridas</p>
      {transfers.length === 0 && <EmptyState icon={<ArrowLeftRight size={32} color={T.teal} />} title="Todo saldado" subtitle="No hay deudas pendientes entre los integrantes por ahora." />}
      <div className="flex flex-col gap-2">
        {transfers.map((tr, i) => {
          const from = data.members.find((m) => m.id === tr.from);
          const to = data.members.find((m) => m.id === tr.to);
          return (
            <Card key={i}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MemberChip member={from} size={22} />
                  <ArrowRight size={14} color={T.inkSoft} />
                  <MemberChip member={to} size={22} />
                </div>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 14, color: T.ink }}>{formatMoney(tr.amount, currency)}</span>
              </div>
              <PrimaryButton full onClick={() => settle(tr)} style={{ marginTop: 10, fontSize: 13, padding: '8px' }}>Marcar como pagado</PrimaryButton>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* CUENTAS                                                                */
/* ---------------------------------------------------------------------- */
function Cuentas({ data, actions, setModal }) {
  const currency = data.currency;
  function balanceOf(acc) {
    return data.transactions
      .filter((t) => t.accountId === acc.id)
      .reduce((s, t) => s + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
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
              <button onClick={() => removeAccount(a.id)}><Trash2 size={15} color={T.inkSoft} /></button>
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
  function toggle(id) { setOwnerIds((o) => o.includes(id) ? o.filter((x) => x !== id) : [...o, id]); }
  async function save() {
    if (!name.trim() || !ownerIds.length) return;
    await actions.addAccount({ name: name.trim(), type, ownerIds });
    onClose();
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
      <PrimaryButton full onClick={save}>Crear cuenta</PrimaryButton>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* CRÉDITOS                                                               */
/* ---------------------------------------------------------------------- */
const CREDIT_TYPE_LABELS = { vivienda: 'Vivienda', vehiculo: 'Vehículo', libre_inversion: 'Libre inversión', educativo: 'Educativo', otro: 'Otro' };

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
  const [showAll, setShowAll] = useState(false);

  async function refresh() {
    const [p, e] = await Promise.all([actions.loadCreditPayments(credit.id), actions.loadCreditExtraPayments(credit.id)]);
    setPayments(p); setExtras(e);
  }
  useEffect(() => { refresh(); }, [credit.id]);

  async function remove() {
    if (!confirm(`¿Eliminar el crédito "${credit.name}"? Se borrará también su tabla de amortización.`)) return;
    await actions.deleteCredit(credit.id);
    onDeleted();
  }

  const paidCount = payments?.filter((p) => p.paid).length || 0;
  const totalCount = payments?.length || 0;
  const nextUnpaid = payments?.find((p) => !p.paid);
  const currentBalance = payments?.length ? (payments.filter((p) => p.paid).slice(-1)[0]?.balanceAfter ?? credit.principal) : credit.principal;
  const money = (v) => credit.currency === 'UVR' ? `${v.toLocaleString('es-CO', { maximumFractionDigits: 2 })} UVR` : formatMoney(v, data.currency);

  const visiblePayments = showAll ? payments : payments?.slice(0, 6);

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
          <button onClick={remove}><Trash2 size={16} color={T.inkSoft} /></button>
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
          {credit.insuranceMonthly > 0 && <span className="flex items-center gap-1"><ShieldCheck size={12} color={T.inkSoft} /><span style={{ fontSize: 11.5, color: T.inkSoft }}>Seguro {money(credit.insuranceMonthly)}/mes</span></span>}
        </div>
        {credit.status !== 'pagado' && (
          <div className="flex gap-2 mt-4">
            <GhostButton full onClick={() => setModal({ type: 'extraPayment', payload: { credit, payments }, onDone: refresh })}>Abono a capital</GhostButton>
            {nextUnpaid && <PrimaryButton full onClick={() => setModal({ type: 'payInstallment', payload: { credit, installment: nextUnpaid }, onDone: refresh })}>Pagar cuota {nextUnpaid.installmentNumber}</PrimaryButton>}
          </div>
        )}
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
  const [principal, setPrincipal] = useState('');
  const [annualRate, setAnnualRate] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [amortizationSystem, setAmortizationSystem] = useState('frances');
  const [insuranceMonthly, setInsuranceMonthly] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [uvr, setUvr] = useState(null);
  const [loadingUvr, setLoadingUvr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    const p = parseFloat(principal), r = parseFloat(annualRate), t = parseInt(termMonths, 10);
    if (!name.trim() || !p || !r || !t) { setError('Completa nombre, monto, tasa y plazo.'); return; }
    setSaving(true); setError('');
    try {
      await actions.createCredit({
        name: name.trim(), creditType, currency, principal: p, annualRate: r, termMonths: t,
        amortizationSystem, insuranceMonthly: parseFloat(insuranceMonthly) || 0, startDate,
        ownerMemberId: ownerMemberId || null, accountId: accountId || null,
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
      <Field label={`Monto del crédito (${currency})`}>
        <input style={inputStyle} type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Tasa efectiva anual (E.A. %)">
        <input style={inputStyle} type="number" step="0.01" value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} placeholder="Ej. 24.5" />
      </Field>
      <Field label="Plazo (meses)">
        <input style={inputStyle} type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} placeholder="Ej. 180" />
      </Field>
      <Field label="Sistema de amortización">
        <select style={inputStyle} value={amortizationSystem} onChange={(e) => setAmortizationSystem(e.target.value)}>
          <option value="frances">Francés (cuota fija)</option>
          <option value="aleman">Alemán (abono a capital fijo)</option>
        </select>
      </Field>
      <Field label="Seguros mensuales (opcional)">
        <input style={inputStyle} type="number" value={insuranceMonthly} onChange={(e) => setInsuranceMonthly(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Fecha de inicio">
        <input style={inputStyle} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
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
      {!uvr && !loading && <p style={{ fontSize: 12.5, color: T.danger }} className="mb-3">No se pudo consultar el valor automáticamente. Ingrésalo manualmente:</p>}
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
  const [installed, setInstalled] = useState(window.matchMedia?.('(display-mode: standalone)').matches);

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

  if (installed || !deferredPrompt) return null;

  return (
    <Card style={{ marginBottom: 14, background: T.tealSoft, border: 'none' }}>
      <div className="flex items-center justify-between">
        <div>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Instalar la app</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Agrégala a tu pantalla de inicio para usarla como una app nativa.</p>
        </div>
        <PrimaryButton onClick={async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); }} style={{ padding: '8px 14px', fontSize: 12.5, flexShrink: 0 }}>
          Instalar
        </PrimaryButton>
      </div>
    </Card>
  );
}

function Ajustes({ data, update, actions, setModal }) {
  function removeCategory(id) {
    actions.removeCategory(id);
  }
  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-3">Ajustes</p>

      <InstallAppCard />

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
          <button onClick={() => setModal({ type: 'category' })}><Plus size={18} color={T.teal} /></button>
        </div>
        <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-2">Ingresos</p>
        {data.categories.filter((c) => c.type === 'income').map((c) => (
          <div key={c.id} className="flex items-center justify-between mb-1.5">
            <span style={{ fontSize: 13, color: T.ink }}>{c.icon} {c.name}</span>
            <button onClick={() => removeCategory(c.id)}><Trash2 size={13} color={T.inkSoft} /></button>
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-2 mt-3">Gastos</p>
        {data.categories.filter((c) => c.type === 'expense').map((c) => (
          <div key={c.id} className="flex items-center justify-between mb-1.5">
            <span style={{ fontSize: 13, color: T.ink }}>{c.icon} {c.name}</span>
            <button onClick={() => removeCategory(c.id)}><Trash2 size={13} color={T.inkSoft} /></button>
          </div>
        ))}
      </Card>
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
  const [icon, setIcon] = useState('🔖');
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
      <Field label="Emoji / ícono">
        <input style={inputStyle} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🔖" />
      </Field>
      <PrimaryButton full onClick={save}>Crear categoría</PrimaryButton>
    </Modal>
  );
}
