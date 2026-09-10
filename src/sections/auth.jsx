import React, { useState } from 'react';
import { Wallet, Eye, EyeOff } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle, CURRENCIES, GOOGLE_FONTS_IMPORT } from '../ui/theme';
import { Card, Field, PrimaryButton, GhostButton } from '../ui/primitives';
import * as db from '../lib/db';

export function ResetPasswordScreen({ onDone }) {
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

export function LoadingScreen() {
  return (
    <div style={{ background: T.bg, minHeight: '100vh' }} className="flex items-center justify-center">
      <style>{`${GOOGLE_FONTS_IMPORT}`}</style>
      <p style={{ fontFamily: FONT_BODY, color: T.inkSoft }}>Cargando…</p>
    </div>
  );
}

export function AuthShell({ children }) {
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

export function PasswordField({ label, value, onChange, placeholder }) {
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

export function AuthScreen() {
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

export function HouseholdSetup({ userId, onReady, joinError }) {
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
