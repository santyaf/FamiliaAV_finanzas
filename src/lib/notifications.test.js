import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildNotificationCandidates } from './notifications';

// "Hoy" = 16 de junio de 2026 → mes al 53% (16/30). Pasa las dos compuertas:
// rule 1 (>0.15 && <0.95) y rule 5 (>0.5).
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-16T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const emptyData = {
  currency: 'COP', budgets: [], transactions: [], categories: [], goals: [], accounts: [],
};
const types = (out) => out.map((n) => n.type).sort();

describe('buildNotificationCandidates', () => {
  it('sin datos → sin notificaciones', () => {
    expect(buildNotificationCandidates(emptyData, [], 'me')).toEqual([]);
  });

  it('proyección de presupuesto: avisa si al ritmo actual vas a exceder', () => {
    const data = {
      ...emptyData,
      categories: [{ id: 'c1', name: 'Mercado' }],
      budgets: [{ id: 'b1', categoryId: 'c1', limit: 100, scope: 'household' }],
      transactions: [{ id: 't1', type: 'expense', categoryId: 'c1', amount: 60, date: '2026-06-05', memberId: 'm1' }],
    };
    const out = buildNotificationCandidates(data, [], 'me');
    const n = out.find((x) => x.type === 'budget_projection');
    expect(n).toBeTruthy();
    expect(n.title).toContain('Mercado');
    expect(n.dedupeKey).toBe('budget:b1:2026-06');
    expect(n.userId).toBe(null); // scope household
  });

  it('NO avisa de presupuesto si vas dentro del límite proyectado', () => {
    const data = {
      ...emptyData,
      categories: [{ id: 'c1', name: 'Mercado' }],
      budgets: [{ id: 'b1', categoryId: 'c1', limit: 1000, scope: 'household' }],
      transactions: [{ id: 't1', type: 'expense', categoryId: 'c1', amount: 60, date: '2026-06-05', memberId: 'm1' }],
    };
    expect(buildNotificationCandidates(data, [], 'me').some((n) => n.type === 'budget_projection')).toBe(false);
  });

  it('presupuesto por integrante → userId = ese integrante', () => {
    const data = {
      ...emptyData,
      categories: [{ id: 'c1', name: 'Mercado' }],
      budgets: [{ id: 'b1', categoryId: 'c1', limit: 100, scope: 'm2' }],
      transactions: [{ id: 't1', type: 'expense', categoryId: 'c1', amount: 60, date: '2026-06-05', memberId: 'm2' }],
    };
    const n = buildNotificationCandidates(data, [], 'me').find((x) => x.type === 'budget_projection');
    expect(n.userId).toBe('m2');
  });

  it('ritmo de objetivo: meta a <30 días y por debajo del 90%', () => {
    const data = {
      ...emptyData,
      goals: [{ id: 'g1', name: 'Carro', targetAmount: 100, currentAmount: 50, targetDate: '2026-07-01' }],
    };
    const n = buildNotificationCandidates(data, [], 'me').find((x) => x.type === 'goal_pace');
    expect(n).toBeTruthy();
    expect(n.title).toContain('Carro');
    expect(n.title).toContain('50%');
  });

  it('NO avisa del objetivo si va al 90%+ o la meta está lejos', () => {
    const casesData = [
      { id: 'g1', name: 'A', targetAmount: 100, currentAmount: 95, targetDate: '2026-07-01' }, // 95%
      { id: 'g2', name: 'B', targetAmount: 100, currentAmount: 10, targetDate: '2027-01-01' }, // lejos
    ];
    const out = buildNotificationCandidates({ ...emptyData, goals: casesData }, [], 'me');
    expect(out.some((n) => n.type === 'goal_pace')).toBe(false);
  });

  it('ingreso extraordinario: un ingreso del mes ≥ 2× el promedio', () => {
    const data = {
      ...emptyData,
      transactions: [
        { id: 'i1', type: 'income', amount: 1_000_000, date: '2026-04-10', memberId: 'm1' },
        { id: 'i2', type: 'income', amount: 1_000_000, date: '2026-05-10', memberId: 'm1' },
        { id: 'i3', type: 'income', amount: 6_000_000, date: '2026-06-10', memberId: 'm1' },
      ],
    };
    const n = buildNotificationCandidates(data, [], 'me').find((x) => x.type === 'extra_income');
    expect(n).toBeTruthy();
    expect(n.dedupeKey).toBe('income:i3');
    expect(n.userId).toBe('m1');
  });

  it('cuota de crédito por vencer en ≤ 7 días', () => {
    const credits = [{
      credit: { id: 'cr1', name: 'Hipoteca', currency: 'COP', ownerMemberId: 'm1' },
      payments: [
        { id: 'p1', paid: true, dueDate: '2026-05-19', installmentNumber: 2, total: 500000 },
        { id: 'p2', paid: false, dueDate: '2026-06-19', installmentNumber: 3, total: 500000 },
      ],
    }];
    const n = buildNotificationCandidates(emptyData, credits, 'me').find((x) => x.type === 'credit_due');
    expect(n).toBeTruthy();
    expect(n.body).toContain('en 3 días');
    expect(n.dedupeKey).toBe('credit_due:p2');
  });

  it('NO avisa de la cuota si vence en más de 7 días', () => {
    const credits = [{
      credit: { id: 'cr1', name: 'Hipoteca', currency: 'COP' },
      payments: [{ id: 'p1', paid: false, dueDate: '2026-06-30', installmentNumber: 3, total: 500000 }],
    }];
    expect(buildNotificationCandidates(emptyData, credits, 'me').some((n) => n.type === 'credit_due')).toBe(false);
  });

  it('excedente familiar: ingreso familiar del mes con >25% de excedente', () => {
    const data = {
      ...emptyData,
      accounts: [{ id: 'a1', type: 'shared' }],
      transactions: [
        { id: 't1', type: 'income', amount: 1_000_000, date: '2026-06-02', accountId: 'a1' },
        { id: 't2', type: 'expense', amount: 400_000, date: '2026-06-05', accountId: 'a1' },
      ],
    };
    const n = buildNotificationCandidates(data, [], 'me').find((x) => x.type === 'surplus_opportunity');
    expect(n).toBeTruthy();
    expect(n.dedupeKey).toBe('surplus:2026-06');
  });
});
