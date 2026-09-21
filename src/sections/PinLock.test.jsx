// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, renderHook, act } from '@testing-library/react';
import { PinLockScreen, PinSettingsCard } from './PinLock';
import { usePinLock } from '../lib/usePinLock';

// auth.jsx importa el cliente de Supabase, que exige variables de entorno
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));

afterEach(() => cleanup());

const fastHasher = async (pin, salt) => `h(${salt}:${pin})`;
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

describe('PinLockScreen', () => {
  it('no envía un PIN incompleto y muestra el error de uno incorrecto', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ status: 'wrong', waitSeconds: 0, remaining: 7 });
    render(<PinLockScreen onSubmit={onSubmit} onSignOut={() => {}} />);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('1234'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/Te quedan 7 intentos/);
  });
  it('solo acepta números y permite cerrar sesión si se olvidó el PIN', () => {
    const onSignOut = vi.fn();
    render(<PinLockScreen onSubmit={vi.fn()} onSignOut={onSignOut} />);
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: 'ab12cd' } });
    expect(screen.getByLabelText('PIN').value).toBe('12');
    fireEvent.click(screen.getByRole('button', { name: /Olvidaste el PIN/ }));
    expect(onSignOut).toHaveBeenCalled();
  });
});

describe('usePinLock', () => {
  it('sin PIN no bloquea; activarlo lo guarda; recargar arranca bloqueado', async () => {
    const storage = memoryStorage();
    const first = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    expect(first.result.current.enabled).toBe(false);
    expect(first.result.current.locked).toBe(false);
    await act(async () => { await first.result.current.enable('1234', 5); });
    expect(first.result.current.enabled).toBe(true);
    expect(first.result.current.locked).toBe(false); // acaba de crearlo: no se bloquea a sí mismo
    const second = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    expect(second.result.current.locked).toBe(true); // "reabrió" la app
    expect(renderHook(() => usePinLock({ userId: 'u2', storage, hasher: fastHasher })).result.current.locked).toBe(false); // otra persona
  });

  it('el PIN correcto desbloquea, el incorrecto no', async () => {
    const storage = memoryStorage();
    const seed = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    await act(async () => { await seed.result.current.enable('1234', 1); });
    const { result } = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    let r;
    await act(async () => { r = await result.current.unlock('0000'); });
    expect(r.status).toBe('wrong');
    expect(result.current.locked).toBe(true);
    await act(async () => { r = await result.current.unlock('1234'); });
    expect(r.status).toBe('ok');
    expect(result.current.locked).toBe(false);
  });

  it('vuelve a bloquear al regresar a la app después del tiempo elegido', async () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    await act(async () => { await result.current.enable('1234', 0); }); // 0 = cada vez que sale
    const setVisibility = (v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); };
    act(() => setVisibility('hidden'));
    act(() => setVisibility('visible'));
    expect(result.current.locked).toBe(true);
  });

  it('con 10 errores seguidos borra el PIN y cierra la sesión', async () => {
    const storage = memoryStorage();
    const onSignOut = vi.fn();
    const seed = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    await act(async () => { await seed.result.current.enable('1234', 1); });
    const { result } = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher, onSignOut }));
    const rec = JSON.parse(storage.getItem('fam_pin_v1:u1'));
    storage.setItem('fam_pin_v1:u1', JSON.stringify({ ...rec, failed: 9 }));
    const again = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher, onSignOut }));
    await act(async () => { await again.result.current.unlock('0000'); });
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(storage.getItem('fam_pin_v1:u1')).toBeNull();
    expect(result.current).toBeTruthy();
  });

  it('quitar el PIN exige el PIN actual', async () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    await act(async () => { await result.current.enable('1234', 1); });
    let r;
    await act(async () => { r = await result.current.disable('9999'); });
    expect(r.status).toBe('wrong');
    expect(result.current.enabled).toBe(true);
    await act(async () => { r = await result.current.disable('1234'); });
    expect(r.status).toBe('ok');
    expect(result.current.enabled).toBe(false);
  });
});

describe('PinSettingsCard', () => {
  it('activar valida que los dos PIN coincidan', async () => {
    const enable = vi.fn().mockResolvedValue();
    render(<PinSettingsCard pin={{ enabled: false, timeoutMin: 1, enable }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activar bloqueo con PIN' }));
    fireEvent.change(screen.getByLabelText('Nuevo PIN'), { target: { value: '1234' } });
    fireEvent.change(screen.getByLabelText('Repite el PIN'), { target: { value: '1235' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    expect(screen.getByText('Los dos PIN no coinciden.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Repite el PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    await waitFor(() => expect(enable).toHaveBeenCalledWith('1234', 1));
  });
  it('con PIN activo se puede bloquear ahora o cambiar el tiempo', () => {
    const lockNow = vi.fn(); const setTimeoutMin = vi.fn();
    render(<PinSettingsCard pin={{ enabled: true, timeoutMin: 1, lockNow, setTimeoutMin }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear ahora' }));
    expect(lockNow).toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Cuándo bloquear'), { target: { value: '15' } });
    expect(setTimeoutMin).toHaveBeenCalledWith(15);
  });
});

describe('Huella o Face ID', () => {
  const stubCredentials = (impl) => Object.defineProperty(navigator, 'credentials', { value: impl, configurable: true });
  const withPlatform = (available = true) => { window.PublicKeyCredential = { isUserVerifyingPlatformAuthenticatorAvailable: async () => available }; };
  afterEach(() => { delete window.PublicKeyCredential; stubCredentials(undefined); });

  it('la pantalla de bloqueo ofrece la huella solo si está activada', () => {
    const { unmount } = render(<PinLockScreen onSubmit={vi.fn()} onSignOut={() => {}} />);
    expect(screen.queryByRole('button', { name: /huella o Face ID/ })).toBeNull();
    unmount();
    const onBiometric = vi.fn().mockResolvedValue({ status: 'ok' });
    render(<PinLockScreen onSubmit={vi.fn()} onSignOut={() => {}} onBiometric={onBiometric} />);
    fireEvent.click(screen.getByRole('button', { name: /huella o Face ID/ }));
    expect(onBiometric).toHaveBeenCalled();
  });
  it('si la huella falla lo dice y deja usar el PIN', async () => {
    const onBiometric = vi.fn().mockResolvedValue({ status: 'error', message: 'Sensor no disponible' });
    render(<PinLockScreen onSubmit={vi.fn()} onSignOut={() => {}} onBiometric={onBiometric} />);
    fireEvent.click(screen.getByRole('button', { name: /huella o Face ID/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('Sensor no disponible');
    expect(screen.getByLabelText('PIN')).toBeTruthy();
  });
  it('activar la huella desde Ajustes exige tener PIN; desbloquear con ella abre la app', async () => {
    withPlatform(true);
    const create = vi.fn().mockResolvedValue({ rawId: new Uint8Array([1, 2, 3]).buffer });
    const get = vi.fn().mockResolvedValue({ id: 'ok' });
    stubCredentials({ create, get });
    const storage = memoryStorage();
    const seed = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    expect(seed.result.current.biometric).toBe(false);
    await act(async () => { await seed.result.current.enable('1234', 1); });
    await act(async () => { await seed.result.current.enableBiometric('Ana'); });
    expect(seed.result.current.biometric).toBe(true);

    const reopened = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    expect(reopened.result.current.locked).toBe(true);
    expect(reopened.result.current.biometric).toBe(true);
    await act(async () => { await reopened.result.current.unlockBiometric(); });
    expect(reopened.result.current.locked).toBe(false);
  });
  it('quitar el PIN también quita la huella', async () => {
    stubCredentials({ create: vi.fn().mockResolvedValue({ rawId: new Uint8Array([9]).buffer }), get: vi.fn() });
    const storage = memoryStorage();
    const { result } = renderHook(() => usePinLock({ userId: 'u1', storage, hasher: fastHasher }));
    await act(async () => { await result.current.enable('1234', 1); });
    await act(async () => { await result.current.enableBiometric(); });
    expect(result.current.biometric).toBe(true);
    await act(async () => { await result.current.disable('1234'); });
    expect(result.current.biometric).toBe(false);
    expect(storage.getItem('fam_biometric_v1:u1')).toBeNull();
  });
  it('la tarjeta de Ajustes muestra la opción solo si el dispositivo la soporta', async () => {
    const pin = { enabled: true, biometric: false, timeoutMin: 1, setTimeoutMin: () => {}, lockNow: () => {}, disable: vi.fn(), enable: vi.fn(), enableBiometric: vi.fn().mockResolvedValue({ status: 'ok' }), disableBiometric: vi.fn() };
    render(<PinSettingsCard pin={pin} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByLabelText(/huella o Face ID/)).toBeNull();
    cleanup();
    withPlatform(true); stubCredentials({ create: () => {} });
    render(<PinSettingsCard pin={pin} />);
    const box = await screen.findByLabelText(/Desbloquear también con huella o Face ID/);
    fireEvent.click(box);
    await waitFor(() => expect(pin.enableBiometric).toHaveBeenCalled());
  });
});
