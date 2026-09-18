import { describe, it, expect } from 'vitest';
import { budgetAllowances, projectMonth } from './projection';

const categories = [
  { id: 'sal', name: 'Salario', type: 'income', nature: 'operativo' },
  { id: 'mer', name: 'Mercado', type: 'expense', nature: 'operativo' },
  { id: 'arr', name: 'Arriendo', type: 'expense', nature: 'operativo', isFixed: true },
  { id: 'deu', name: 'Deudas', type: 'expense', nature: 'financiamiento' },
  { id: 'pre', name: 'Préstamos recibidos', type: 'income', nature: 'financiamiento' },
];
const tx = (o) => ({ id: Math.random().toString(36), memberId: 'm1', accountId: 'a1', ...o });
const TODAY = '2026-09-10'; // septiembre tiene 30 días: hoy es el día 10, faltan 20 después de hoy

describe('projectMonth', () => {
  it('extrapola el ritmo diario de los gastos variables y toma los fijos tal cual', () => {
    const r = projectMonth({
      todayISO: TODAY, categories,
      transactions: [
        tx({ type: 'income', categoryId: 'sal', amount: 3000000, date: '2026-09-01' }),
        tx({ type: 'expense', categoryId: 'arr', amount: 900000, date: '2026-09-02' }),
        tx({ type: 'expense', categoryId: 'mer', amount: 200000, date: '2026-09-05' }),
        tx({ type: 'expense', categoryId: 'mer', amount: 100000, date: '2026-09-09' }),
      ],
    });
    expect(r.variableSoFar).toBe(300000);
    expect(r.fixed).toBe(900000);
    expect(r.dailyAverage).toBe(30000);
    expect(r.projectedExpense).toBe(900000 + 300000 + 30000 * 20);
    expect(r.projectedBalance).toBe(3000000 - 1800000);
    expect(r.status).toBe('ok');
    expect(r.confidence).toBe('high');
  });

  it('un gasto recurrente cuenta completo en el mes y no se extrapola', () => {
    const r = projectMonth({
      todayISO: TODAY, categories,
      transactions: [tx({ type: 'expense', categoryId: 'mer', amount: 50000, date: '2026-01-15', recurring: true, frequency: 'mensual' })],
    });
    expect(r.fixed).toBe(50000);
    expect(r.variableSoFar).toBe(0);
    expect(r.projectedExpense).toBe(50000);
  });

  it('ignora préstamos, capital de deudas, transferencias y saldos iniciales', () => {
    const r = projectMonth({
      todayISO: TODAY, categories,
      transactions: [
        tx({ type: 'income', categoryId: 'pre', amount: 5000000, date: '2026-09-03' }),
        tx({ type: 'expense', categoryId: 'deu', amount: 400000, date: '2026-09-04' }),
        tx({ type: 'transfer', accountId: 'a1', toAccountId: 'a2', amount: 100000, date: '2026-09-05' }),
        tx({ type: 'income', categoryId: 'sal', amount: 1000, date: '2026-09-01', nature: 'apertura' }),
      ],
    });
    expect(r.incomeSoFar).toBe(0);
    expect(r.projectedExpense).toBe(0);
  });

  it('la naturaleza del movimiento manda sobre la de la categoría', () => {
    const r = projectMonth({ todayISO: TODAY, categories, transactions: [tx({ type: 'expense', categoryId: 'mer', amount: 80000, date: '2026-09-02', nature: 'inversion' })] });
    expect(r.projectedExpense).toBe(0);
  });

  it('si el ritmo supera los ingresos, avisa "over"; si deja menos del 10%, "tight"', () => {
    const base = [tx({ type: 'income', categoryId: 'sal', amount: 1000000, date: '2026-09-01' })];
    const over = projectMonth({ todayISO: TODAY, categories, transactions: [...base, tx({ type: 'expense', categoryId: 'mer', amount: 500000, date: '2026-09-03' })] });
    expect(over.status).toBe('over');
    const tight = projectMonth({ todayISO: TODAY, categories, transactions: [...base, tx({ type: 'expense', categoryId: 'mer', amount: 310000, date: '2026-09-03' })] });
    expect(tight.projectedBalance).toBeGreaterThan(0);
    expect(tight.status).toBe('tight');
  });

  it('al inicio del mes la confianza es baja', () => {
    expect(projectMonth({ todayISO: '2026-09-03', categories, transactions: [] }).confidence).toBe('low');
    expect(projectMonth({ todayISO: '2026-09-07', categories, transactions: [] }).confidence).toBe('medium');
  });

  it('el último día del mes la proyección es lo gastado', () => {
    const r = projectMonth({ todayISO: '2026-09-30', categories, transactions: [tx({ type: 'expense', categoryId: 'mer', amount: 120000, date: '2026-09-20' })] });
    expect(r.daysAfterToday).toBe(0);
    expect(r.projectedExpense).toBe(120000);
  });
});

describe('budgetAllowances', () => {
  const budgets = [
    { id: 'b1', categoryId: 'mer', limit: 600000, scope: 'household' },
    { id: 'b2', categoryId: 'arr', limit: 100000, scope: 'm2' },
  ];
  it('reparte lo que queda entre los días que faltan (contando hoy)', () => {
    const r = budgetAllowances({
      mKey: '2026-09', daysLeft: 21, budgets,
      transactions: [tx({ type: 'expense', categoryId: 'mer', amount: 210000, date: '2026-09-05' })],
    });
    expect(r.rows[0]).toMatchObject({ spent: 210000, remaining: 390000 });
    expect(r.rows[0].perDay).toBeCloseTo(18571.43, 2);
  });
  it('un presupuesto personal solo cuenta los gastos de ese integrante', () => {
    const r = budgetAllowances({
      mKey: '2026-09', daysLeft: 10, budgets,
      transactions: [
        tx({ type: 'expense', categoryId: 'arr', amount: 40000, date: '2026-09-05', memberId: 'm1' }),
        tx({ type: 'expense', categoryId: 'arr', amount: 25000, date: '2026-09-06', memberId: 'm2' }),
      ],
    });
    expect(r.rows[1].spent).toBe(25000);
  });
  it('un presupuesto pasado resta del total disponible', () => {
    const r = budgetAllowances({
      mKey: '2026-09', daysLeft: 10, budgets: [budgets[0], { id: 'b3', categoryId: 'arr', limit: 100000, scope: 'household' }],
      transactions: [tx({ type: 'expense', categoryId: 'arr', amount: 150000, date: '2026-09-05' })],
    });
    expect(r.rows[1].perDay).toBe(-5000);
    expect(r.totalPerDay).toBe(60000 - 5000);
  });
  it('no divide entre cero si daysLeft es 0', () => {
    expect(budgetAllowances({ mKey: '2026-09', daysLeft: 0, budgets: [budgets[0]], transactions: [] }).rows[0].perDay).toBe(600000);
  });
});
