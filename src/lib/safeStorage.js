// Acceso a localStorage que nunca rompe la app: tocarlo puede lanzar (navegación
// privada, cookies bloqueadas) y escribir puede fallar por cuota llena. El
// storage se inyecta para poder probarlo con uno falso.

export function getStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}
export function readJSON(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
export function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function removeKey(storage, key) {
  try { storage.removeItem(key); } catch { /* sin acceso a storage: nada que borrar */ }
}
