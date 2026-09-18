// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import { useOfflineQueue } from './useOfflineQueue';

const KEY = 'test-queue';
const item = (id) => ({ id, kind: 'addTransaction', payload: { amount: 10 } });

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

function setup({ send = vi.fn().mockResolvedValue(undefined) } = {}) {
  const onSynced = vi.fn().mockResolvedValue(undefined);
  const onReconnect = vi.fn();
  const hook = renderHook(() => useOfflineQueue({ storageKey: KEY, send, onSynced, onReconnect }));
  return { ...hook, send, onSynced, onReconnect };
}

beforeEach(() => {
  localStorage.clear();
  setOnline(true);
});
afterEach(() => cleanup());

describe('useOfflineQueue', () => {
  it('guarda lo encolado en localStorage y cuenta los pendientes, sin enviar si no hay señal', () => {
    setOnline(false);
    const { result, send } = setup();
    act(() => { result.current.enqueue(item('a')); });
    expect(result.current.online).toBe(false);
    expect(result.current.pending).toBe(1);
    expect(JSON.parse(localStorage.getItem(KEY))).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('recupera la cola guardada al volver a abrir la app', () => {
    localStorage.setItem(KEY, JSON.stringify([{ ...item('a'), status: 'pending', error: null }]));
    setOnline(false);
    const { result } = setup();
    expect(result.current.pending).toBe(1);
    expect(result.current.items[0].id).toBe('a');
  });

  it('con señal: syncNow envía, vacía la cola y avisa para recargar datos', async () => {
    const { result, send, onSynced } = setup();
    act(() => { result.current.enqueue(item('a')); });
    await act(async () => { await result.current.syncNow(); });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(result.current.pending).toBe(0);
    expect(onSynced).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual([]);
  });

  it('al volver la señal envía solo lo pendiente y avisa la reconexión', async () => {
    setOnline(false);
    const { result, send, onReconnect } = setup();
    act(() => { result.current.enqueue(item('a')); });
    expect(send).not.toHaveBeenCalled();

    setOnline(true);
    act(() => { window.dispatchEvent(new Event('online')); });

    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(send).toHaveBeenCalledTimes(1);
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(result.current.online).toBe(true);
  });

  it('un error de red deja el ítem pendiente y un reintento posterior lo envía', async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(undefined);
    const { result } = setup({ send });
    act(() => { result.current.enqueue(item('a')); });

    await act(async () => { await result.current.syncNow(); });
    expect(result.current.pending).toBe(1);
    expect(result.current.failed).toBe(0);

    await act(async () => { await result.current.syncNow(); });
    expect(result.current.pending).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('un rechazo del servidor lo marca como fallido, y retryFailed lo reintenta', async () => {
    const send = vi.fn().mockRejectedValueOnce({ code: '42501', message: 'RLS' }).mockResolvedValue(undefined);
    const { result } = setup({ send });
    act(() => { result.current.enqueue(item('a')); });

    await act(async () => { await result.current.syncNow(); });
    expect(result.current.failed).toBe(1);
    expect(result.current.pending).toBe(0);
    expect(result.current.items[0]).toMatchObject({ status: 'failed', error: 'RLS' });

    act(() => { result.current.retryFailed(); });
    await waitFor(() => expect(result.current.items).toHaveLength(0));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('un duplicado (23505) cuenta como enviado — el primer intento sí había llegado', async () => {
    const send = vi.fn().mockRejectedValue({ code: '23505', message: 'duplicate key' });
    const { result } = setup({ send });
    act(() => { result.current.enqueue(item('a')); });
    await act(async () => { await result.current.syncNow(); });
    expect(result.current.items).toHaveLength(0);
  });

  it('descartar quita el ítem de la cola y de localStorage', () => {
    setOnline(false);
    const { result } = setup();
    act(() => { result.current.enqueue(item('a')); result.current.enqueue(item('b')); });
    act(() => { result.current.discard('a'); });
    expect(result.current.items.map((i) => i.id)).toEqual(['b']);
    expect(JSON.parse(localStorage.getItem(KEY)).map((i) => i.id)).toEqual(['b']);
  });

  it('no lanza dos envíos a la vez si syncNow se llama dos veces seguidas', async () => {
    let resolveSend;
    const send = vi.fn(() => new Promise((resolve) => { resolveSend = resolve; }));
    const { result } = setup({ send });
    act(() => { result.current.enqueue(item('a')); });
    await act(async () => {
      const p1 = result.current.syncNow();
      const p2 = result.current.syncNow();
      resolveSend();
      await Promise.all([p1, p2]);
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(0);
  });
});
