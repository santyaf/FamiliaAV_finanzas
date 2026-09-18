// Estado de las notificaciones POR PERSONA (leída / archivada / eliminada) — lógica pura.
// La notificación es una fila compartida (las del hogar las ven todos); el estado vive en
// notification_states, una fila por (notificación, persona). Eliminar es lógico, así la
// misma alerta no vuelve a generarse (su dedupe_key sigue ocupada).

// Une cada notificación con el estado de esta persona. `notifications.read` (columna
// anterior) se respeta: lo que ya estaba marcado como leído sigue leído.
export function mergeNotificationStates(notifications, states) {
  const byId = new Map((states || []).map((s) => [s.notificationId, s]));
  return notifications.map((n) => {
    const s = byId.get(n.id);
    return { ...n, read: !!(n.read || s?.readAt), archived: !!s?.archivedAt, deleted: !!s?.deletedAt };
  });
}

// 'unread': lo que ve el pop-up · 'read': leídas sin archivar · 'archived': archivadas.
export function notificationsInView(list, view) {
  return list.filter((n) => {
    if (n.deleted) return false;
    if (view === 'archived') return n.archived;
    if (n.archived) return false;
    return view === 'read' ? n.read : !n.read;
  });
}

export function notificationCounts(list) {
  return {
    unread: notificationsInView(list, 'unread').length,
    read: notificationsInView(list, 'read').length,
    archived: notificationsInView(list, 'archived').length,
  };
}

// Columnas de notification_states que cambia cada acción. Archivar y eliminar
// también dan por leída la notificación.
export function statePatchFor(action, nowISO) {
  switch (action) {
    case 'read': return { read_at: nowISO };
    case 'archive': return { archived_at: nowISO, read_at: nowISO };
    case 'unarchive': return { archived_at: null };
    case 'delete': return { deleted_at: nowISO, read_at: nowISO };
    default: throw new Error(`Acción de notificación desconocida: ${action}`);
  }
}

export const NOTIFICATION_ACTIONS = ['read', 'archive', 'unarchive', 'delete'];
