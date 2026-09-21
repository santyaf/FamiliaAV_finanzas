import { describe, it, expect } from 'vitest';
import { requiredApprovals, requestProgress, groupRequests, approvedRequestsOf, exceedsThreshold, pendingForMe, STATUS_LABELS } from './spendRequests';

const members = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const req = (id, requestedBy, status = 'pending', createdAt = '2026-09-01') => ({ id, requestedBy, status, createdAt, title: id, amount: 100 });
const vote = (requestId, memberId, v) => ({ requestId, memberId, vote: v });

describe('requiredApprovals', () => {
  it('la mayoría de los otros integrantes', () => {
    expect([1, 2, 3, 4, 5].map(requiredApprovals)).toEqual([1, 2, 2, 3, 3]);
  });
});

describe('requestProgress', () => {
  it('quien pide no cuenta ni como votante ni como voto', () => {
    const p = requestProgress(req('r1', 'a'), [vote('r1', 'a', 'approve'), vote('r1', 'b', 'approve')], members);
    expect(p).toMatchObject({ others: 3, needed: 2, approvals: 1, rejections: 0 });
    expect(p.waitingOn.map((m) => m.id)).toEqual(['c', 'd']);
  });
  it('detecta cuando ya no se puede aprobar', () => {
    const votes = [vote('r1', 'b', 'reject'), vote('r1', 'c', 'reject')];
    expect(requestProgress(req('r1', 'a'), votes, members).hopeless).toBe(true);
    expect(requestProgress(req('r1', 'a'), [vote('r1', 'b', 'reject')], members).hopeless).toBe(false);
  });
  it('en un hogar de dos, el otro decide', () => {
    const two = [{ id: 'a' }, { id: 'b' }];
    expect(requestProgress(req('r1', 'a'), [], two)).toMatchObject({ others: 1, needed: 1, hopeless: false });
    expect(requestProgress(req('r1', 'a'), [vote('r1', 'b', 'reject')], two).hopeless).toBe(true);
  });
  it('ignora votos de quien ya no está en el hogar y votos de otras solicitudes', () => {
    const votes = [vote('r1', 'zzz', 'approve'), vote('r2', 'b', 'approve')];
    expect(requestProgress(req('r1', 'a'), votes, members).approvals).toBe(0);
  });
});

describe('groupRequests', () => {
  const requests = [
    req('p1', 'b', 'pending', '2026-09-03'), // de otro: por responder
    req('p2', 'c', 'pending', '2026-09-02'), // de otro, ya voté
    req('m1', 'a', 'pending', '2026-09-04'), // mía abierta
    req('ap', 'a', 'approved', '2026-09-05'), // mía aprobada por registrar
    req('ap2', 'b', 'approved', '2026-09-01'), // aprobada de otro
    req('rj', 'a', 'rejected', '2026-08-30'),
    req('dn', 'a', 'done', '2026-08-29'),
    req('cx', 'b', 'cancelled', '2026-08-28'),
  ];
  const votes = [vote('p2', 'a', 'approve')];
  const g = groupRequests(requests, votes, members, 'a');
  it('separa lo que debo responder de lo que ya respondí', () => {
    expect(g.toAnswer.map((r) => r.id)).toEqual(['p1']);
    expect(g.answered.map((r) => r.id)).toEqual(['p2']);
  });
  it('mis solicitudes abiertas y las aprobadas por registrar', () => {
    expect(g.mine.map((r) => r.id)).toEqual(['m1']);
    expect(g.toRegister.map((r) => r.id)).toEqual(['ap']);
  });
  it('el historial reúne lo cerrado, del más reciente al más antiguo', () => {
    expect(g.history.map((r) => r.id)).toEqual(['ap2', 'rj', 'dn', 'cx']);
  });
  it('cuenta lo que espera mi respuesta', () => {
    expect(pendingForMe(requests, votes, 'a')).toBe(1);
    expect(pendingForMe(requests, [], 'a')).toBe(2);
    expect(pendingForMe(undefined, undefined, 'a')).toBe(0);
  });
});

describe('utilidades', () => {
  it('solo mis solicitudes aprobadas se pueden vincular a un gasto', () => {
    expect(approvedRequestsOf([req('x', 'a', 'approved'), req('y', 'b', 'approved'), req('z', 'a', 'pending')], 'a').map((r) => r.id)).toEqual(['x']);
  });
  it('umbral: sin umbral no hay aviso; con umbral, desde ese monto', () => {
    expect(exceedsThreshold(1_000_000, null)).toBe(false);
    expect(exceedsThreshold(999_999, 1_000_000)).toBe(false);
    expect(exceedsThreshold(1_000_000, 1_000_000)).toBe(true);
  });
  it('tiene una etiqueta por estado', () => {
    ['pending', 'approved', 'rejected', 'cancelled', 'done'].forEach((s) => expect(STATUS_LABELS[s]).toBeTruthy());
  });
});
