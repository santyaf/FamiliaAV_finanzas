// Solicitudes de gasto: pedir el visto bueno del hogar antes de un gasto grande. Se aprueba con la mayoría de los
// OTROS integrantes (quien pide no vota). La base aplica la misma regla en un trigger; aquí se calcula para mostrar
// el avance ("1 de 2 aprobaciones") y agrupar la lista.

export const requiredApprovals = (others) => Math.floor(others / 2) + 1;

export const STATUS_LABELS = {
  pending: 'Esperando respuestas', approved: 'Aprobada', rejected: 'Rechazada', cancelled: 'Cancelada', done: 'Registrada',
};

export const exceedsThreshold = (amount, threshold) => Number(threshold) > 0 && Number(amount) >= Number(threshold);

export function requestProgress(request, votes, members) {
  const others = (members || []).filter((m) => m.id !== request.requestedBy);
  const otherIds = new Set(others.map((m) => m.id));
  const mine = (votes || []).filter((v) => v.requestId === request.id && otherIds.has(v.memberId));
  const needed = requiredApprovals(others.length);
  const approvals = mine.filter((v) => v.vote === 'approve').length;
  const rejections = mine.filter((v) => v.vote === 'reject').length;
  const answered = new Set(mine.map((v) => v.memberId));
  return {
    others: others.length, needed, approvals, rejections,
    votes: mine,
    waitingOn: others.filter((m) => !answered.has(m.id)),
    // con esta mayoría ya no se puede aprobar
    hopeless: rejections > others.length - needed,
  };
}

// Lista agrupada para la pantalla: lo que debo responder, mis solicitudes abiertas, lo aprobado por registrar y el historial.
export function groupRequests(requests, votes, members, userId) {
  const sorted = [...(requests || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const iVoted = (r) => (votes || []).some((v) => v.requestId === r.id && v.memberId === userId);
  const toAnswer = sorted.filter((r) => r.status === 'pending' && r.requestedBy !== userId);
  return {
    toAnswer: toAnswer.filter((r) => !iVoted(r)),
    answered: toAnswer.filter(iVoted),
    mine: sorted.filter((r) => r.status === 'pending' && r.requestedBy === userId),
    toRegister: sorted.filter((r) => r.status === 'approved' && r.requestedBy === userId),
    history: sorted.filter((r) => r.status === 'rejected' || r.status === 'cancelled' || r.status === 'done' || (r.status === 'approved' && r.requestedBy !== userId)),
  };
}

export const approvedRequestsOf = (requests, userId) => (requests || []).filter((r) => r.status === 'approved' && r.requestedBy === userId);

// Cuántas solicitudes esperan la respuesta de esta persona (para un aviso en la lista de Gestión).
export const pendingForMe = (requests, votes, userId) => groupRequests(requests, votes, [], userId).toAnswer.length;
