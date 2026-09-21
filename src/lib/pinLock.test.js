import { describe, it, expect } from 'vitest';
import {
  isValidPin, createPinRecord, attemptUnlock, needsLock, readPin, writePin, clearPin, defaultHasher,
  MAX_FAILED_BEFORE_SIGNOUT, storageKey,
} from './pinLock';

// hash rápido y determinista para no gastar 120.000 iteraciones en cada prueba
const fastHasher = async (pin, salt) => `h(${salt}:${pin})`;
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m }; };

describe('isValidPin', () => {
  it('4 a 6 dígitos, solo números', () => {
    ['1234', '123456', '0000'].forEach((p) => expect(isValidPin(p)).toBe(true));
    ['123', '1234567', 'abcd', '12 34', '', null, undefined, '12.4'].forEach((p) => expect(isValidPin(p)).toBe(false));
  });
});

describe('createPinRecord', () => {
  it('guarda hash con sal, nunca el PIN', async () => {
    const r = await createPinRecord('1234', { hasher: fastHasher, salt: 'sal', timeoutMin: 5 });
    expect(r).toMatchObject({ salt: 'sal', hash: 'h(sal:1234)', timeoutMin: 5, failed: 0, lockedUntil: 0 });
    expect(JSON.stringify(r)).not.toContain('"1234"');
  });
  it('rechaza un PIN inválido', async () => {
    await expect(createPinRecord('12', { hasher: fastHasher })).rejects.toThrow(/4 a 6/);
  });
  it('con el hash real (PBKDF2) el mismo PIN y sal dan el mismo hash, y otro PIN otro hash', async () => {
    const a = await defaultHasher('1234', 'sal', 1000);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await defaultHasher('1234', 'sal', 1000)).toBe(a);
    expect(await defaultHasher('1235', 'sal', 1000)).not.toBe(a);
    expect(await defaultHasher('1234', 'otra', 1000)).not.toBe(a);
  });
});

describe('attemptUnlock', () => {
  const NOW = 1_700_000_000_000;
  const make = () => createPinRecord('4321', { hasher: fastHasher, salt: 's' });

  it('el PIN correcto desbloquea y reinicia los intentos', async () => {
    const rec = { ...(await make()), failed: 3 };
    const r = await attemptUnlock(rec, '4321', { now: NOW, hasher: fastHasher });
    expect(r.status).toBe('ok');
    expect(r.record.failed).toBe(0);
  });

  it('un PIN incorrecto suma un intento y avisa cuántos quedan', async () => {
    const r = await attemptUnlock(await make(), '0000', { now: NOW, hasher: fastHasher });
    expect(r).toMatchObject({ status: 'wrong', waitSeconds: 0, remaining: MAX_FAILED_BEFORE_SIGNOUT - 1 });
    expect(r.record.failed).toBe(1);
  });

  it('desde el 5.º error seguido hay espera creciente (30 s, 60 s…, tope 15 min)', async () => {
    let rec = await make();
    const waits = [];
    for (let i = 0; i < 9; i++) {
      const r = await attemptUnlock({ ...rec, lockedUntil: 0 }, '0000', { now: NOW, hasher: fastHasher });
      waits.push(r.waitSeconds); rec = r.record;
    }
    expect(waits).toEqual([0, 0, 0, 0, 30, 60, 120, 240, 480]);
  });

  it('durante la espera no se prueba ni el PIN correcto', async () => {
    const rec = { ...(await make()), failed: 5, lockedUntil: NOW + 20000 };
    const r = await attemptUnlock(rec, '4321', { now: NOW, hasher: fastHasher });
    expect(r).toMatchObject({ status: 'wait', waitSeconds: 20 });
  });

  it('al 10.º error seguido pide cerrar la sesión', async () => {
    const rec = { ...(await make()), failed: MAX_FAILED_BEFORE_SIGNOUT - 1 };
    const r = await attemptUnlock(rec, '0000', { now: NOW, hasher: fastHasher });
    expect(r.status).toBe('signout');
  });
});

describe('needsLock', () => {
  const rec = { timeoutMin: 5 };
  it('bloquea solo si estuvo fuera al menos el tiempo elegido', () => {
    expect(needsLock(rec, { hiddenAt: 0, now: 4 * 60000 })).toBe(false);
    expect(needsLock(rec, { hiddenAt: 0, now: 5 * 60000 })).toBe(true);
  });
  it('con "cada vez que salgo" (0 min) bloquea siempre que salió', () => {
    expect(needsLock({ timeoutMin: 0 }, { hiddenAt: 100, now: 101 })).toBe(true);
  });
  it('sin PIN o sin haber salido no bloquea', () => {
    expect(needsLock(null, { hiddenAt: 0, now: 10 ** 9 })).toBe(false);
    expect(needsLock(rec, { hiddenAt: null, now: 10 ** 9 })).toBe(false);
  });
});

describe('almacenamiento', () => {
  it('guarda, lee y borra por persona', async () => {
    const st = memoryStorage();
    const rec = await createPinRecord('1234', { hasher: fastHasher, salt: 's' });
    writePin(st, 'u1', rec);
    expect(readPin(st, 'u1')).toEqual(rec);
    expect(readPin(st, 'u2')).toBeNull();
    expect(st._m.has(storageKey('u1'))).toBe(true);
    clearPin(st, 'u1');
    expect(readPin(st, 'u1')).toBeNull();
  });
  it('sin storage no rompe', () => {
    expect(readPin(undefined, 'u1')).toBeNull();
    expect(() => writePin(undefined, 'u1', {})).not.toThrow();
  });
});
