// Varios hogares por persona (la familia, los papás, un fondo con amigos…): cuál está activo y cómo se listan.
import { readJSON, writeJSON } from './safeStorage.js';

const activeKey = (userId) => `fam_active_household_v1:${userId}`;

export function readActiveHouseholdId(storage, userId) {
  const v = readJSON(storage, activeKey(userId), null);
  return typeof v === 'string' ? v : null;
}
export function saveActiveHouseholdId(storage, userId, householdId) {
  if (householdId) writeJSON(storage, activeKey(userId), householdId);
}

// El hogar preferido si sigue en la lista; si no (lo dejó, lo borraron), el primero.
export function chooseActiveHousehold(list, preferredId) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((h) => h.householdId === preferredId) || list[0];
}

// La lista guardada para trabajar sin señal: antes era un solo hogar, ahora es una lista.
export function normalizeCachedHouseholds(cached) {
  if (Array.isArray(cached)) return cached.filter((h) => h?.householdId);
  return cached?.householdId ? [cached] : [];
}

export const ROLE_LABELS = { admin: 'Administrador', member: 'Integrante' };

export function householdOptions(list, activeId) {
  return (list || []).map((h) => ({
    id: h.householdId,
    name: h.household?.name || 'Hogar',
    currency: h.household?.currency || 'COP',
    roleLabel: ROLE_LABELS[h.role] || 'Integrante',
    color: h.color,
    isActive: h.householdId === activeId,
  }));
}
