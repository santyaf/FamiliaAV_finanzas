// Bloqueo con PIN al abrir la app — lógica pura (el hash y el almacenamiento se inyectan para probarla).
// Es un seguro de CONVENIENCIA en este dispositivo (que nadie que tome tu celular desbloqueado vea tus
// finanzas): el PIN se guarda solo aquí, como hash con sal. No reemplaza la contraseña ni la sesión de Supabase.
import { readJSON, writeJSON, removeKey } from './safeStorage';

export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const MAX_FAILED_BEFORE_SIGNOUT = 10;
export const FAILED_BEFORE_DELAY = 5;
export const TIMEOUT_OPTIONS = [
  { min: 0, label: 'Cada vez que salgo de la app' },
  { min: 1, label: 'Después de 1 minuto fuera' },
  { min: 5, label: 'Después de 5 minutos fuera' },
  { min: 15, label: 'Después de 15 minutos fuera' },
];
const ITERATIONS = 120000;
export const storageKey = (userId) => `fam_pin_v1:${userId}`;

export const isValidPin = (pin) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(String(pin ?? ''));

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// PBKDF2-SHA256 con WebCrypto (en el navegador y en Node 20).
export async function defaultHasher(pin, salt, iterations = ITERATIONS) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Este navegador no permite crear el PIN de forma segura.');
  const key = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations }, key, 256);
  return toHex(bits);
}
export const randomSalt = () => toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));

export async function createPinRecord(pin, { timeoutMin = 1, hasher = defaultHasher, salt = randomSalt(), iterations = ITERATIONS } = {}) {
  if (!isValidPin(pin)) throw new Error(`El PIN debe tener de ${PIN_MIN} a ${PIN_MAX} números.`);
  return { salt, iterations, hash: await hasher(pin, salt, iterations), timeoutMin, failed: 0, lockedUntil: 0 };
}

// Compara en tiempo constante (aprox.) para no filtrar cuántos caracteres coinciden.
const safeEqual = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// Intenta desbloquear. Devuelve { status: 'ok' | 'wrong' | 'wait' | 'signout', record, waitSeconds }.
//  - tras 5 errores seguidos hay que esperar 30 s, luego el doble (tope 15 min)
//  - tras 10 errores se cierra la sesión (habrá que entrar con la contraseña)
export async function attemptUnlock(record, pin, { now = Date.now(), hasher = defaultHasher } = {}) {
  if (record.lockedUntil > now) return { status: 'wait', record, waitSeconds: Math.ceil((record.lockedUntil - now) / 1000) };
  const ok = safeEqual(await hasher(pin, record.salt, record.iterations), record.hash);
  if (ok) return { status: 'ok', record: { ...record, failed: 0, lockedUntil: 0 }, waitSeconds: 0 };
  const failed = record.failed + 1;
  if (failed >= MAX_FAILED_BEFORE_SIGNOUT) return { status: 'signout', record: { ...record, failed }, waitSeconds: 0 };
  const waitSeconds = failed >= FAILED_BEFORE_DELAY ? Math.min(900, 30 * 2 ** (failed - FAILED_BEFORE_DELAY)) : 0;
  return { status: 'wrong', record: { ...record, failed, lockedUntil: waitSeconds ? now + waitSeconds * 1000 : 0 }, waitSeconds, remaining: MAX_FAILED_BEFORE_SIGNOUT - failed };
}

// ¿Hay que bloquear al volver a la app? hiddenAt = cuándo salió (ms) o null si nunca salió.
export function needsLock(record, { hiddenAt, now = Date.now() }) {
  if (!record) return false;
  if (hiddenAt === null || hiddenAt === undefined) return false;
  return now - hiddenAt >= (record.timeoutMin || 0) * 60000;
}

export const readPin = (storage, userId) => readJSON(storage, storageKey(userId), null);
export const writePin = (storage, userId, record) => writeJSON(storage, storageKey(userId), record);
export const clearPin = (storage, userId) => removeKey(storage, storageKey(userId));
