import { useCallback, useEffect, useRef, useState } from 'react';
import { getStorage } from './safeStorage';
import { readBiometric, clearBiometric, registerBiometric, verifyBiometric } from './biometric';
import {
  attemptUnlock, createPinRecord, needsLock, readPin, writePin, clearPin, defaultHasher,
} from './pinLock';

// Estado del bloqueo con PIN de esta persona en este dispositivo. Arranca bloqueado si hay PIN, y vuelve
// a bloquear al regresar a la app después del tiempo elegido (visibilitychange).
// startUnlocked: al cambiar de hogar la app se vuelve a montar; no debe pedir el PIN otra vez en la misma sesión.
export function usePinLock({ userId, onSignOut, storage = getStorage(), hasher = defaultHasher, startUnlocked = false }) {
  const [record, setRecord] = useState(() => readPin(storage, userId));
  const [locked, setLocked] = useState(() => !startUnlocked && !!readPin(storage, userId));
  const [bio, setBio] = useState(() => !!readBiometric(storage, userId));
  const recordRef = useRef(record);
  const hiddenAt = useRef(null);
  recordRef.current = record;

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return; }
      if (needsLock(recordRef.current, { hiddenAt: hiddenAt.current })) setLocked(true);
      hiddenAt.current = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const save = useCallback((next) => { writePin(storage, userId, next); setRecord(next); }, [storage, userId]);

  // → { status: 'ok' | 'wrong' | 'wait' | 'signout', waitSeconds, remaining }
  const unlock = useCallback(async (pin) => {
    const result = await attemptUnlock(recordRef.current, pin, { hasher });
    if (result.status === 'signout') { clearPin(storage, userId); clearBiometric(storage, userId); setBio(false); setRecord(null); setLocked(false); await onSignOut?.(); return result; }
    if (result.record !== recordRef.current) save(result.record);
    if (result.status === 'ok') setLocked(false);
    return result;
  }, [hasher, onSignOut, save, storage, userId]);

  const enable = useCallback(async (pin, timeoutMin) => {
    save(await createPinRecord(pin, { timeoutMin, hasher }));
    setLocked(false);
  }, [hasher, save]);

  // quitar / cambiar exige el PIN actual
  const disable = useCallback(async (pin) => {
    const result = await attemptUnlock(recordRef.current, pin, { hasher });
    if (result.status !== 'ok') { if (result.record !== recordRef.current) save(result.record); return result; }
    clearPin(storage, userId); clearBiometric(storage, userId); setBio(false); setRecord(null); setLocked(false);
    return result;
  }, [hasher, save, storage, userId]);

  const setTimeoutMin = useCallback((min) => { if (recordRef.current) save({ ...recordRef.current, timeoutMin: min }); }, [save]);

  // huella / Face ID: solo como atajo del PIN (exige tener PIN activado)
  const enableBiometric = useCallback(async (userName) => {
    const r = await registerBiometric({ storage, userId, userName });
    if (r.status === 'ok') setBio(true);
    return r;
  }, [storage, userId]);
  const disableBiometric = useCallback(() => { clearBiometric(storage, userId); setBio(false); }, [storage, userId]);
  const unlockBiometric = useCallback(async () => {
    const r = await verifyBiometric({ storage, userId });
    if (r.status === 'ok') setLocked(false);
    return r;
  }, [storage, userId]);

  return { enabled: !!record, biometric: bio && !!record, enableBiometric, disableBiometric, unlockBiometric, locked, timeoutMin: record?.timeoutMin ?? 1, unlock, enable, disable, setTimeoutMin, lockNow: () => { if (recordRef.current) setLocked(true); } };
}
