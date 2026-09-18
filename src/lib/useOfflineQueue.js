import { useState, useEffect, useRef, useCallback } from 'react';
import {
  enqueueItem, removeItem, retryAllFailed, countByStatus,
  flushQueue, applyFlushResult, withTimeout,
} from './offlineQueue';
import { readJSON, writeJSON, getStorage } from './safeStorage';

export const SEND_TIMEOUT_MS = 10000; // más de esto sin respuesta = tratar como sin señal
const RETRY_EVERY_MS = 20000;

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

// Conecta la cola (offlineQueue.js) con el navegador: persiste en localStorage,
// reintenta al volver la señal, al volver a abrir la app y cada 20 s mientras
// quede algo pendiente.
//  - send(item): envía un ítem al servidor (lanza si falla)
//  - onSynced(): se llama después de enviar algo, para recargar los datos
//  - onReconnect(): se llama al volver la señal (haya cola o no)
export function useOfflineQueue({ storageKey, send, onSynced, onReconnect }) {
  const [items, setItems] = useState(() => readJSON(getStorage(), storageKey, []));
  const [online, setOnline] = useState(isOnline);
  const [syncing, setSyncing] = useState(false);
  const itemsRef = useRef(items);
  const flushing = useRef(false);
  const sendRef = useRef(send);
  const onSyncedRef = useRef(onSynced);
  const onReconnectRef = useRef(onReconnect);
  sendRef.current = send;
  onSyncedRef.current = onSynced;
  onReconnectRef.current = onReconnect;

  const commit = useCallback((updater) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    writeJSON(getStorage(), storageKey, next);
    setItems(next);
  }, [storageKey]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (countByStatus(itemsRef.current).pending === 0) return;
    if (!isOnline()) return;
    flushing.current = true;
    setSyncing(true);
    try {
      const result = await flushQueue(itemsRef.current, (item) => withTimeout(sendRef.current(item), SEND_TIMEOUT_MS));
      commit((cur) => applyFlushResult(cur, result));
      if (result.sentIds.length) {
        try { await onSyncedRef.current?.(result); } catch { /* recargar es best-effort */ }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [commit]);

  const enqueue = useCallback((item) => commit((cur) => enqueueItem(cur, item)), [commit]);
  const discard = useCallback((id) => commit((cur) => removeItem(cur, id)), [commit]);
  const retryFailed = useCallback(() => { commit(retryAllFailed); flush(); }, [commit, flush]);

  useEffect(() => {
    const goOnline = () => { setOnline(true); onReconnectRef.current?.(); flush(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') flush(); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    flush();
    const timer = setInterval(flush, RETRY_EVERY_MS);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [flush]);

  return { items, online, syncing, enqueue, discard, retryFailed, syncNow: flush, ...countByStatus(items) };
}
