import React, { useEffect, useRef, useState } from 'react';
import { Lock, ShieldCheck, Fingerprint } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, GhostButton } from '../ui/primitives';
import { AuthShell } from './auth';
import { TIMEOUT_OPTIONS, isValidPin, PIN_MIN, PIN_MAX } from '../lib/pinLock';
import { biometricSupported } from '../lib/biometric';

// Pantalla que tapa la app mientras está bloqueada.
export function PinLockScreen({ onSubmit, onSignOut, onBiometric }) {
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // el sistema exige un toque de la persona para pedir la huella: por eso es un botón y no automático
  async function useBiometric() {
    setMessage('');
    const r = await onBiometric();
    if (r.status === 'error') setMessage(r.message || 'No se pudo verificar. Usa tu PIN.');
  }

  async function submit(e) {
    e?.preventDefault();
    if (!isValidPin(pin) || busy) return;
    setBusy(true);
    try {
      const r = await onSubmit(pin);
      if (r.status === 'wait') setMessage(`Demasiados intentos. Espera ${r.waitSeconds} s.`);
      else if (r.status === 'wrong') setMessage(`PIN incorrecto.${r.waitSeconds ? ` Espera ${r.waitSeconds} s.` : ''} Te quedan ${r.remaining} intentos antes de cerrar tu sesión.`);
      setPin('');
    } catch (err) {
      setMessage(err.message || 'No se pudo verificar el PIN.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <AuthShell>
      <Card>
        <form onSubmit={submit}>
          <div className="flex items-center gap-2 mb-2"><Lock size={18} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>App bloqueada</p></div>
          <p style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Escribe tu PIN para ver tus finanzas.</p>
          <input ref={inputRef} style={{ ...inputStyle, textAlign: 'center', letterSpacing: 8, fontSize: 22 }} type="password" inputMode="numeric" autoComplete="off"
            maxLength={PIN_MAX} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="PIN" />
          {message && <p style={{ color: T.danger, fontSize: 12.5 }} className="mt-2" role="alert">{message}</p>}
          <div className="mt-4"><PrimaryButton full type="submit" onClick={submit}>{busy ? 'Verificando…' : 'Desbloquear'}</PrimaryButton></div>
        </form>
        {onBiometric && (
          <GhostButton full onClick={useBiometric} style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Fingerprint size={16} /> Usar huella o Face ID</GhostButton>
        )}
        <GhostButton full onClick={onSignOut} style={{ marginTop: 10, fontSize: 13 }}>¿Olvidaste el PIN? Cerrar sesión</GhostButton>
      </Card>
    </AuthShell>
  );
}

// Ajustes → bloqueo con PIN: activar, cambiar el tiempo, bloquear ahora y quitar.
export function PinSettingsCard({ pin }) {
  const [mode, setMode] = useState(null); // 'enable' | 'remove'
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [timeout, setTimeoutValue] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioMessage, setBioMessage] = useState('');
  useEffect(() => { biometricSupported().then(setBioAvailable); }, []);
  const reset = () => { setMode(null); setA(''); setB(''); setError(''); };
  async function toggleBiometric() {
    setBioMessage('');
    if (pin.biometric) { pin.disableBiometric(); return; }
    const r = await pin.enableBiometric();
    if (r.status === 'error') setBioMessage(r.message || 'No se pudo activar.');
    else if (r.status === 'cancelled') setBioMessage('No se activó: cancelaste la verificación.');
  }

  async function enable() {
    if (!isValidPin(a)) { setError(`El PIN debe tener de ${PIN_MIN} a ${PIN_MAX} números.`); return; }
    if (a !== b) { setError('Los dos PIN no coinciden.'); return; }
    setBusy(true); setError('');
    try { await pin.enable(a, timeout); reset(); } catch (e) { setError(e.message || 'No se pudo activar el PIN.'); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try {
      const r = await pin.disable(a);
      if (r.status === 'ok') reset();
      else if (r.status === 'signout') { /* el hook cierra la sesión */ }
      else setError(r.status === 'wait' ? `Espera ${r.waitSeconds} s.` : 'PIN incorrecto.');
    } catch (e) { setError(e.message || 'No se pudo quitar el PIN.'); } finally { setBusy(false); setA(''); }
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2 mb-1"><ShieldCheck size={15} color={T.ink} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Bloqueo con PIN</p></div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Pide un PIN al abrir la app en este dispositivo, para que nadie que tome tu celular vea tus finanzas. El PIN se guarda solo aquí y no reemplaza tu contraseña.</p>

      {!pin.enabled && mode !== 'enable' && <GhostButton full onClick={() => setMode('enable')} style={{ fontSize: 13 }}>Activar bloqueo con PIN</GhostButton>}
      {!pin.enabled && mode === 'enable' && (
        <div>
          <input style={inputStyle} type="password" inputMode="numeric" maxLength={PIN_MAX} value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} placeholder={`Nuevo PIN (${PIN_MIN} a ${PIN_MAX} números)`} aria-label="Nuevo PIN" />
          <input style={{ ...inputStyle, marginTop: 8 }} type="password" inputMode="numeric" maxLength={PIN_MAX} value={b} onChange={(e) => setB(e.target.value.replace(/\D/g, ''))} placeholder="Repite el PIN" aria-label="Repite el PIN" />
          <select style={{ ...inputStyle, marginTop: 8 }} value={timeout} onChange={(e) => setTimeoutValue(Number(e.target.value))} aria-label="Cuándo bloquear">
            {TIMEOUT_OPTIONS.map((o) => <option key={o.min} value={o.min}>{o.label}</option>)}
          </select>
          {error && <p role="alert" style={{ color: T.danger, fontSize: 12 }} className="mt-2">{error}</p>}
          <div className="flex gap-2 mt-3"><GhostButton onClick={reset} style={{ flex: 1 }}>Cancelar</GhostButton><PrimaryButton onClick={enable} style={{ flex: 2 }}>{busy ? 'Guardando…' : 'Activar'}</PrimaryButton></div>
        </div>
      )}

      {pin.enabled && mode !== 'remove' && (
        <div>
          <select style={inputStyle} value={pin.timeoutMin} onChange={(e) => pin.setTimeoutMin(Number(e.target.value))} aria-label="Cuándo bloquear">
            {TIMEOUT_OPTIONS.map((o) => <option key={o.min} value={o.min}>{o.label}</option>)}
          </select>
          {bioAvailable && (
            <label className="flex items-center gap-2 mt-3">
              <input type="checkbox" checked={!!pin.biometric} onChange={toggleBiometric} />
              <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>Desbloquear también con huella o Face ID</span>
            </label>
          )}
          {bioMessage && <p style={{ color: T.danger, fontSize: 12 }} className="mt-1" role="alert">{bioMessage}</p>}
          <div className="flex gap-2 mt-3">
            <GhostButton onClick={pin.lockNow} style={{ flex: 1, fontSize: 13 }}>Bloquear ahora</GhostButton>
            <GhostButton onClick={() => setMode('remove')} style={{ flex: 1, fontSize: 13 }}>Quitar el PIN</GhostButton>
          </div>
        </div>
      )}
      {pin.enabled && mode === 'remove' && (
        <div>
          <input style={inputStyle} type="password" inputMode="numeric" maxLength={PIN_MAX} value={a} onChange={(e) => setA(e.target.value.replace(/\D/g, ''))} placeholder="Escribe tu PIN actual" aria-label="PIN actual" />
          {error && <p role="alert" style={{ color: T.danger, fontSize: 12 }} className="mt-2">{error}</p>}
          <div className="flex gap-2 mt-3"><GhostButton onClick={reset} style={{ flex: 1 }}>Cancelar</GhostButton><PrimaryButton onClick={remove} style={{ flex: 2 }}>{busy ? 'Verificando…' : 'Quitar PIN'}</PrimaryButton></div>
        </div>
      )}
    </Card>
  );
}
