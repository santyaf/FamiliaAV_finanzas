// Desbloqueo con huella o Face ID (WebAuthn con autenticador de la plataforma). Es una comodidad SOBRE el PIN,
// no lo reemplaza: sigue siendo un bloqueo local de este dispositivo. La credencial vive en el chip del
// teléfono; aquí solo se guarda su identificador para pedirla al desbloquear.
import { readJSON, writeJSON, removeKey } from './safeStorage.js';

const key = (userId) => `fam_biometric_v1:${userId}`;

const toB64Url = (buf) => {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (str) => {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

export const readBiometric = (storage, userId) => readJSON(storage, key(userId), null);
export const clearBiometric = (storage, userId) => removeKey(storage, key(userId));

// ¿Este dispositivo tiene huella / Face ID / desbloqueo del sistema utilizable desde la app?
export async function biometricSupported({ nav = globalThis.navigator, win = globalThis.window } = {}) {
  try {
    if (!win?.PublicKeyCredential || !nav?.credentials?.create) return false;
    return !!(await win.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch { return false; }
}

const isCancel = (e) => e?.name === 'NotAllowedError' || e?.name === 'AbortError';

// → { status: 'ok' } | { status: 'cancelled' } | { status: 'error', message }
export async function registerBiometric({ storage, userId, userName = 'Yo', nav = globalThis.navigator, cryptoApi = globalThis.crypto }) {
  try {
    const cred = await nav.credentials.create({
      publicKey: {
        challenge: cryptoApi.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Finanzas del Hogar' },
        user: { id: new TextEncoder().encode(userId), name: userName, displayName: userName },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60000,
      },
    });
    if (!cred?.rawId) return { status: 'error', message: 'El dispositivo no devolvió la credencial.' };
    writeJSON(storage, key(userId), { credentialId: toB64Url(cred.rawId), createdAt: new Date().toISOString() });
    return { status: 'ok' };
  } catch (e) {
    return isCancel(e) ? { status: 'cancelled' } : { status: 'error', message: e?.message || 'No se pudo activar.' };
  }
}

export async function verifyBiometric({ storage, userId, nav = globalThis.navigator, cryptoApi = globalThis.crypto }) {
  const record = readBiometric(storage, userId);
  if (!record?.credentialId) return { status: 'error', message: 'No hay huella activada en este dispositivo.' };
  try {
    const assertion = await nav.credentials.get({
      publicKey: {
        challenge: cryptoApi.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromB64Url(record.credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60000,
      },
    });
    return assertion ? { status: 'ok' } : { status: 'cancelled' };
  } catch (e) {
    return isCancel(e) ? { status: 'cancelled' } : { status: 'error', message: e?.message || 'No se pudo verificar.' };
  }
}
