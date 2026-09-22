import React, { useEffect, useState } from 'react';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, GhostButton } from '../ui/primitives';
import { AuthShell } from './auth';

const cleanCode = (v) => v.replace(/\D/g, '').slice(0, 6);
const friendly = (e, fallback) => {
  const m = String(e?.message || '');
  if (/disabled/i.test(m)) return 'La verificación en dos pasos no está habilitada en el servidor. Actívala en Supabase → Authentication → Multi-Factor.';
  if (/invalid|expired/i.test(m)) return 'El código no es correcto o ya venció. Espera al siguiente y vuelve a intentar.';
  return m || fallback;
};

// Ajustes → verificación en dos pasos (app autenticadora: Google Authenticator, Authy, 1Password…).
export function MfaCard({ api }) {
  const [factors, setFactors] = useState(null);
  const [enrolling, setEnrolling] = useState(null); // { id, qr, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try { setFactors(await api.listFactors()); } catch (e) { setFactors([]); setError(friendly(e, 'No se pudo consultar la verificación en dos pasos.')); }
  }
  useEffect(() => { load(); }, []);

  async function start() {
    setBusy(true); setError('');
    try { setEnrolling(await api.enroll()); setCode(''); } catch (e) { setError(friendly(e, 'No se pudo iniciar la activación.')); } finally { setBusy(false); }
  }
  async function confirm() {
    if (code.length !== 6) { setError('El código tiene 6 números.'); return; }
    setBusy(true); setError('');
    try { await api.verifyEnroll(enrolling.id, code); setEnrolling(null); setCode(''); await load(); } catch (e) { setError(friendly(e, 'No se pudo verificar el código.')); } finally { setBusy(false); }
  }
  async function cancelEnroll() {
    try { if (enrolling) await api.unenroll(enrolling.id); } catch { /* el factor sin verificar caduca solo */ }
    setEnrolling(null); setCode(''); setError('');
  }
  async function remove(f) {
    if (!window.confirm('¿Desactivar la verificación en dos pasos? Tu cuenta quedará protegida solo por la contraseña.')) return;
    setBusy(true); setError('');
    try { await api.unenroll(f.id); await load(); } catch (e) { setError(friendly(e, 'No se pudo desactivar.')); } finally { setBusy(false); }
  }

  const active = (factors || []).filter((f) => f.status === 'verified');
  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2 mb-1"><KeyRound size={15} color={T.ink} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Verificación en dos pasos</p></div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Además de la contraseña, al entrar se pide un código de 6 números de una app autenticadora. Protege tus finanzas si alguien descubre tu contraseña.</p>

      {factors === null && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Cargando…</p>}
      {factors && !enrolling && active.length === 0 && <GhostButton full onClick={start} style={{ fontSize: 13 }}>{busy ? 'Preparando…' : 'Activar verificación en dos pasos'}</GhostButton>}
      {factors && !enrolling && active.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 mb-2" style={{ fontSize: 12.5, color: T.teal, fontFamily: FONT_BODY, fontWeight: 600 }}><ShieldCheck size={15} /> Activada</p>
          <GhostButton full onClick={() => remove(active[0])} style={{ fontSize: 13 }}>Desactivar</GhostButton>
        </div>
      )}
      {enrolling && (
        <div>
          <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }} className="mb-2">1. Escanea este código con tu app autenticadora:</p>
          {enrolling.qr && <img src={enrolling.qr} alt="Código QR para la app autenticadora" style={{ width: 170, height: 170, margin: '0 auto', background: '#fff', borderRadius: 8 }} />}
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">¿No puedes escanear? Escribe esta clave en la app:</p>
          <p style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.ink, wordBreak: 'break-all' }} className="mb-3">{enrolling.secret}</p>
          <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }} className="mb-1">2. Escribe el código de 6 números que muestra la app:</p>
          <input style={{ ...inputStyle, textAlign: 'center', letterSpacing: 6, fontSize: 20 }} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} aria-label="Código de verificación" />
          <div className="flex gap-2 mt-3"><GhostButton onClick={cancelEnroll} style={{ flex: 1 }}>Cancelar</GhostButton><PrimaryButton onClick={confirm} style={{ flex: 2 }}>{busy ? 'Verificando…' : 'Activar'}</PrimaryButton></div>
        </div>
      )}
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mt-2">{error}</p>}
    </Card>
  );
}

// Pantalla que pide el código al entrar cuando la cuenta tiene verificación en dos pasos.
export function MfaChallengeScreen({ onVerify, onSignOut }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e?.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true); setError('');
    try { await onVerify(code); } catch (err) { setError(friendly(err, 'No se pudo verificar el código.')); setCode(''); } finally { setBusy(false); }
  }
  return (
    <AuthShell>
      <Card>
        <form onSubmit={submit}>
          <div className="flex items-center gap-2 mb-2"><ShieldCheck size={18} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Verificación en dos pasos</p></div>
          <p style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Abre tu app autenticadora y escribe el código de 6 números.</p>
          <input style={{ ...inputStyle, textAlign: 'center', letterSpacing: 8, fontSize: 22 }} inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(cleanCode(e.target.value))} aria-label="Código de verificación" />
          {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mt-2" role="alert">{error}</p>}
          <div className="mt-4"><PrimaryButton full type="submit" onClick={submit}>{busy ? 'Verificando…' : 'Verificar'}</PrimaryButton></div>
        </form>
        <GhostButton full onClick={onSignOut} style={{ marginTop: 10, fontSize: 13 }}>Cerrar sesión</GhostButton>
      </Card>
    </AuthShell>
  );
}
