// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { biometricSupported, registerBiometric, verifyBiometric, readBiometric, clearBiometric } from './biometric';

const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const domError = (name) => Object.assign(new Error(name), { name });
const rawId = new Uint8Array([251, 255, 254, 1, 2]).buffer;

describe('biometricSupported', () => {
  it('es falso sin WebAuthn', async () => {
    expect(await biometricSupported({ nav: {}, win: {} })).toBe(false);
    expect(await biometricSupported({ nav: { credentials: { create: () => {} } }, win: {} })).toBe(false);
  });
  it('es verdadero solo si hay un autenticador de la plataforma', async () => {
    const win = (available) => ({ PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => available } });
    const nav = { credentials: { create: () => {} } };
    expect(await biometricSupported({ nav, win: win(true) })).toBe(true);
    expect(await biometricSupported({ nav, win: win(false) })).toBe(false);
  });
  it('un error al consultar cuenta como no disponible', async () => {
    const win = { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => { throw new Error('x'); } } };
    expect(await biometricSupported({ nav: { credentials: { create: () => {} } }, win })).toBe(false);
  });
});

describe('registerBiometric', () => {
  it('pide un autenticador de la plataforma con verificación y guarda solo el identificador', async () => {
    const storage = memoryStorage();
    const create = vi.fn().mockResolvedValue({ rawId });
    const r = await registerBiometric({ storage, userId: 'u1', userName: 'Ana', nav: { credentials: { create } } });
    expect(r.status).toBe('ok');
    const opts = create.mock.calls[0][0].publicKey;
    expect(opts.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required' });
    expect(opts.challenge).toHaveLength(32);
    expect(readBiometric(storage, 'u1').credentialId).toBe('-__-AQI'); // base64url sin relleno
    expect(readBiometric(storage, 'u2')).toBeNull();
  });
  it('si la persona cancela no guarda nada', async () => {
    const storage = memoryStorage();
    const r = await registerBiometric({ storage, userId: 'u1', nav: { credentials: { create: vi.fn().mockRejectedValue(domError('NotAllowedError')) } } });
    expect(r.status).toBe('cancelled');
    expect(readBiometric(storage, 'u1')).toBeNull();
  });
  it('otro error se informa', async () => {
    const r = await registerBiometric({ storage: memoryStorage(), userId: 'u1', nav: { credentials: { create: vi.fn().mockRejectedValue(new Error('sin sensor')) } } });
    expect(r).toEqual({ status: 'error', message: 'sin sensor' });
  });
});

describe('verifyBiometric', () => {
  const setup = async () => {
    const storage = memoryStorage();
    await registerBiometric({ storage, userId: 'u1', nav: { credentials: { create: async () => ({ rawId }) } } });
    return storage;
  };
  it('pide la misma credencial y da ok si la persona se verifica', async () => {
    const storage = await setup();
    const get = vi.fn().mockResolvedValue({ id: 'x' });
    expect((await verifyBiometric({ storage, userId: 'u1', nav: { credentials: { get } } })).status).toBe('ok');
    const req = get.mock.calls[0][0].publicKey;
    expect(req.userVerification).toBe('required');
    expect([...req.allowCredentials[0].id]).toEqual([251, 255, 254, 1, 2]);
  });
  it('sin huella activada avisa', async () => {
    const r = await verifyBiometric({ storage: memoryStorage(), userId: 'u1', nav: { credentials: { get: vi.fn() } } });
    expect(r.status).toBe('error');
  });
  it('cancelar no es error', async () => {
    const storage = await setup();
    expect((await verifyBiometric({ storage, userId: 'u1', nav: { credentials: { get: vi.fn().mockRejectedValue(domError('NotAllowedError')) } } })).status).toBe('cancelled');
  });
  it('quitar la huella borra el registro', async () => {
    const storage = await setup();
    clearBiometric(storage, 'u1');
    expect(readBiometric(storage, 'u1')).toBeNull();
  });
});
