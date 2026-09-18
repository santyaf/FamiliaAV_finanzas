// Cola de escrituras offline (Fase 11). Lógica pura — sin React ni red — para
// poder probarla aislada; el almacenamiento (localStorage) y el envío real
// (Supabase) se inyectan desde afuera.
//
// Idea: si guardar un movimiento falla por falta de señal, en vez de perderlo
// se guarda aquí con un id generado en el cliente y se reintenta después. Ese
// mismo id se manda en el insert, así que reintentar es seguro: si el primer
// intento sí llegó al servidor (y solo se perdió la respuesta), el reintento
// choca con la llave primaria (23505) y se da por enviado, sin duplicar.

const NETWORK_ERROR_RE = /failed to fetch|load failed|networkerror|network request failed|fetch failed/i;

export function isNetworkError(err) {
  if (!err) return false;
  if (err.isNetworkError) return true;
  return NETWORK_ERROR_RE.test(String(err.message ?? err));
}

// Postgres unique_violation: el movimiento ya estaba guardado.
export function isDuplicateError(err) {
  return err?.code === '23505';
}

export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error('Tiempo de espera agotado');
      e.isNetworkError = true;
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ---- operaciones sobre la cola (inmutables) ---- */
export function enqueueItem(items, item) {
  return [...items, { status: 'pending', error: null, createdAt: new Date().toISOString(), ...item }];
}
export function removeItem(items, id) {
  return items.filter((i) => i.id !== id);
}
export function markFailed(items, id, error) {
  return items.map((i) => (i.id === id ? { ...i, status: 'failed', error } : i));
}
export function retryAllFailed(items) {
  return items.map((i) => (i.status === 'failed' ? { ...i, status: 'pending', error: null } : i));
}
export function countByStatus(items) {
  return {
    pending: items.filter((i) => i.status !== 'failed').length,
    failed: items.filter((i) => i.status === 'failed').length,
  };
}

// Intenta enviar, en orden, todo lo pendiente. Se detiene en el primer error de
// red (no tiene caso seguir sin conexión); un error "real" (ej. rechazado por
// el servidor) marca ese ítem como fallido y sigue con los demás.
export async function flushQueue(items, sender) {
  const result = { sentIds: [], failed: [], offline: false };
  for (const item of items) {
    if (item.status === 'failed') continue;
    try {
      await sender(item);
      result.sentIds.push(item.id);
    } catch (err) {
      if (isNetworkError(err)) { result.offline = true; break; }
      if (isDuplicateError(err)) { result.sentIds.push(item.id); continue; }
      result.failed.push({ id: item.id, error: err?.message || 'Error desconocido' });
    }
  }
  return result;
}

// Aplica el resultado de un flush sobre la versión MÁS RECIENTE de la cola
// (pudieron entrar ítems nuevos mientras se enviaba).
export function applyFlushResult(items, { sentIds, failed }) {
  let next = items.filter((i) => !sentIds.includes(i.id));
  failed.forEach((f) => { next = markFailed(next, f.id, f.error); });
  return next;
}

/* ---- vista optimista: los movimientos en cola se muestran ya en la lista ---- */
export function mergePendingTransactions(serverTransactions, items) {
  const known = new Set(serverTransactions.map((t) => t.id));
  const pending = items
    .filter((i) => i.kind === 'addTransaction' && !known.has(i.id))
    .map((i) => ({
      ...i.payload, id: i.id, version: 1,
      pending: true, pendingStatus: i.status, pendingError: i.error,
    }));
  return pending.length ? [...serverTransactions, ...pending] : serverTransactions;
}
