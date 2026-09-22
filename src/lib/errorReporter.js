// Reporte de errores del navegador al administrador (tabla client_errors). Sin datos financieros: solo el mensaje,
// un fragmento del stack, la pantalla y el navegador. Es prudente a propósito: no reporta el mismo error dos veces en una
// sesión, ni más de MAX_PER_SESSION en total, ni ruido que no es un fallo de la app.

export const MAX_PER_SESSION = 8;

// Errores del navegador o de extensiones que no son de la app (y no se pueden arreglar aquí).
const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|NetworkError|Load failed|network request failed/i, // sin señal: lo maneja la cola offline
  /AbortError|The operation was aborted/i,
  /chrome-extension:|moz-extension:/i,
  /^\[object (Event|Object)\]$/, // un recurso que no cargó (imagen, fuente), no un fallo de código
];

export function normalizeError(input) {
  const err = input?.reason ?? input?.error ?? input;
  const message = String(err?.message ?? err ?? 'Error desconocido').slice(0, 500);
  const stack = err?.stack ? String(err.stack).split('\n').slice(0, 8).join('\n').slice(0, 2000) : null;
  return { message, stack };
}

export const isNoise = (message, stack = '') => NOISE.some((re) => re.test(message) || re.test(stack || ''));

// ¿Se reporta este error? Guarda lo ya visto en `state` ({ seen:Set, count })
export function shouldReport(state, { message, stack }) {
  if (isNoise(message, stack)) return false;
  if (state.count >= MAX_PER_SESSION) return false;
  const key = message.slice(0, 120);
  if (state.seen.has(key)) return false;
  state.seen.add(key);
  state.count += 1;
  return true;
}

let active = null;
// Lo usa el ErrorBoundary (que vive fuera de la app, sin sesión): solo reporta si hay un reportero instalado.
export const reportBoundaryError = (error) => active?.reportBoundary(error);

// report({ message, stack, source, route, userAgent }) → promesa; los fallos de red se ignoran (no hay a quién avisar).
export function installErrorReporter({ report, win = globalThis.window }) {
  if (!win?.addEventListener) return { uninstall: () => {}, reportBoundary: () => {} };
  const state = { seen: new Set(), count: 0 };
  const send = (raw, source) => {
    const norm = normalizeError(raw);
    if (!shouldReport(state, norm)) return;
    try {
      Promise.resolve(report({ ...norm, source, route: String(win.location?.hash || '').slice(0, 80), userAgent: String(win.navigator?.userAgent || '').slice(0, 300) })).catch(() => {});
    } catch { /* reportar nunca debe romper la app */ }
  };
  const onError = (e) => send(e, 'window');
  const onRejection = (e) => send(e, 'promise');
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  const handle = {
    uninstall: () => { win.removeEventListener('error', onError); win.removeEventListener('unhandledrejection', onRejection); if (active === handle) active = null; },
    reportBoundary: (error) => send(error, 'boundary'),
  };
  active = handle;
  return handle;
}

// Agrupa los reportes por mensaje para la vista del administrador.
export function groupErrors(rows) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const cur = map.get(r.message) || { message: r.message, count: 0, users: new Set(), last: r.createdAt, stack: r.stack, route: r.route, source: r.source };
    cur.count += 1; cur.users.add(r.userId);
    if (r.createdAt > cur.last) { cur.last = r.createdAt; cur.route = r.route; }
    map.set(r.message, cur);
  });
  return [...map.values()].map((g) => ({ ...g, users: g.users.size })).sort((a, b) => b.last.localeCompare(a.last));
}
