import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isNetworkError, isDuplicateError, withTimeout, newId,
  enqueueItem, removeItem, markFailed, retryAllFailed, countByStatus,
  flushQueue, applyFlushResult, mergePendingTransactions,
} from './offlineQueue';

afterEach(() => vi.useRealTimers());

describe('isNetworkError', () => {
  it('reconoce los mensajes típicos de fetch sin conexión (Chrome, Safari, Firefox)', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true);
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
  });
  it('reconoce el error marcado por withTimeout', () => {
    expect(isNetworkError({ isNetworkError: true, message: 'x' })).toBe(true);
  });
  it('NO trata como red un rechazo del servidor', () => {
    expect(isNetworkError({ code: '42501', message: 'new row violates row-level security policy' })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe('isDuplicateError', () => {
  it('detecta unique_violation de Postgres', () => {
    expect(isDuplicateError({ code: '23505' })).toBe(true);
    expect(isDuplicateError({ code: '23503' })).toBe(false);
    expect(isDuplicateError(null)).toBe(false);
  });
});

describe('withTimeout', () => {
  it('devuelve el resultado si responde a tiempo', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });
  it('rechaza con un error de red si tarda más del límite', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 100);
    const assertion = expect(p).rejects.toMatchObject({ isNetworkError: true });
    vi.advanceTimersByTime(100);
    await assertion;
  });
  it('propaga el error original si la promesa falla antes', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });
});

describe('newId', () => {
  it('genera ids con forma de UUID y distintos entre sí', () => {
    const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const a = newId();
    const b = newId();
    expect(a).toMatch(re);
    expect(a).not.toBe(b);
  });
});

describe('operaciones de la cola', () => {
  it('enqueueItem agrega al final con estado pendiente y no muta el original', () => {
    const base = [{ id: 'a', kind: 'addTransaction', status: 'pending' }];
    const next = enqueueItem(base, { id: 'b', kind: 'addTransaction', payload: { amount: 5 } });
    expect(base).toHaveLength(1);
    expect(next.map((i) => i.id)).toEqual(['a', 'b']);
    expect(next[1]).toMatchObject({ status: 'pending', error: null, payload: { amount: 5 } });
    expect(typeof next[1].createdAt).toBe('string');
  });
  it('removeItem quita por id', () => {
    expect(removeItem([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }]);
  });
  it('markFailed y retryAllFailed cambian solo lo que corresponde', () => {
    const items = [{ id: 'a', status: 'pending', error: null }, { id: 'b', status: 'pending', error: null }];
    const failed = markFailed(items, 'b', 'rechazado');
    expect(failed[0].status).toBe('pending');
    expect(failed[1]).toMatchObject({ status: 'failed', error: 'rechazado' });
    const retried = retryAllFailed(failed);
    expect(retried[1]).toMatchObject({ status: 'pending', error: null });
  });
  it('countByStatus cuenta pendientes y fallidos', () => {
    const items = [{ id: 'a', status: 'pending' }, { id: 'b', status: 'failed' }, { id: 'c', status: 'pending' }];
    expect(countByStatus(items)).toEqual({ pending: 2, failed: 1 });
    expect(countByStatus([])).toEqual({ pending: 0, failed: 0 });
  });
});

describe('flushQueue', () => {
  const q = (...ids) => ids.map((id) => ({ id, kind: 'addTransaction', status: 'pending', payload: {} }));

  it('envía todo en orden cuando hay conexión', async () => {
    const seen = [];
    const result = await flushQueue(q('a', 'b', 'c'), async (i) => { seen.push(i.id); });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result).toEqual({ sentIds: ['a', 'b', 'c'], failed: [], offline: false });
  });

  it('se detiene en el primer error de red y no intenta el resto', async () => {
    const seen = [];
    const sender = async (i) => {
      seen.push(i.id);
      if (i.id === 'b') throw new TypeError('Failed to fetch');
    };
    const result = await flushQueue(q('a', 'b', 'c'), sender);
    expect(seen).toEqual(['a', 'b']);
    expect(result).toEqual({ sentIds: ['a'], failed: [], offline: true });
  });

  it('un duplicado (23505) cuenta como ya enviado', async () => {
    const sender = async () => { throw { code: '23505', message: 'duplicate key' }; };
    const result = await flushQueue(q('a'), sender);
    expect(result).toEqual({ sentIds: ['a'], failed: [], offline: false });
  });

  it('un rechazo real marca ese ítem como fallido y sigue con los demás', async () => {
    const sender = async (i) => { if (i.id === 'a') throw { code: '42501', message: 'RLS' }; };
    const result = await flushQueue(q('a', 'b'), sender);
    expect(result).toEqual({ sentIds: ['b'], failed: [{ id: 'a', error: 'RLS' }], offline: false });
  });

  it('ignora los ítems ya marcados como fallidos', async () => {
    const items = [{ id: 'x', status: 'failed' }, ...q('a')];
    const seen = [];
    await flushQueue(items, async (i) => { seen.push(i.id); });
    expect(seen).toEqual(['a']);
  });
});

describe('applyFlushResult', () => {
  it('quita lo enviado, marca lo fallido y conserva lo que entró mientras tanto', () => {
    const items = [
      { id: 'a', status: 'pending', error: null },
      { id: 'b', status: 'pending', error: null },
      { id: 'nuevo', status: 'pending', error: null },
    ];
    const next = applyFlushResult(items, { sentIds: ['a'], failed: [{ id: 'b', error: 'malo' }] });
    expect(next.map((i) => i.id)).toEqual(['b', 'nuevo']);
    expect(next[0]).toMatchObject({ status: 'failed', error: 'malo' });
    expect(next[1].status).toBe('pending');
  });
});

describe('mergePendingTransactions', () => {
  const server = [{ id: 's1', amount: 10 }];

  it('agrega los movimientos en cola marcados como pendientes', () => {
    const items = [{ id: 'p1', kind: 'addTransaction', status: 'pending', error: null, payload: { amount: 50, type: 'expense' } }];
    const merged = mergePendingTransactions(server, items);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ id: 'p1', amount: 50, type: 'expense', pending: true, pendingStatus: 'pending', version: 1 });
  });

  it('no duplica uno que ya llegó del servidor (mismo id)', () => {
    const items = [{ id: 's1', kind: 'addTransaction', status: 'pending', payload: { amount: 10 } }];
    expect(mergePendingTransactions(server, items)).toEqual(server);
  });

  it('expone el estado de un ítem fallido con su error', () => {
    const items = [{ id: 'p1', kind: 'addTransaction', status: 'failed', error: 'RLS', payload: { amount: 5 } }];
    expect(mergePendingTransactions([], items)[0]).toMatchObject({ pendingStatus: 'failed', pendingError: 'RLS' });
  });

  it('devuelve el mismo arreglo si no hay nada pendiente', () => {
    expect(mergePendingTransactions(server, [])).toBe(server);
  });
});
