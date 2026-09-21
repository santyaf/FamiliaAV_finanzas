import { describe, it, expect } from 'vitest';
import { buildMonthlyReview, previousMonthKey, newDecision, toggleDecision, removeDecision } from './monthlyReview';

const categories = [
  { id: 'sal', name: 'Salario', type: 'income', nature: 'operativo' },
  { id: 'mer', name: 'Mercado', type: 'expense', nature: 'operativo' },
  { id: 'ocio', name: 'Ocio', type: 'expense', nature: 'operativo' },
  { id: 'deu', name: 'Deudas y préstamos', type: 'expense', nature: 'financiamiento' },
  { id: 'int', name: 'Intereses y comisiones', type: 'expense', nature: 'operativo' },
];
const tx = (o) => ({ id: Math.random().toString(36), memberId: 'm1', accountId: 'a1', ...o });
const transactions = [
  // agosto
  tx({ type: 'income', categoryId: 'sal', amount: 4000000, date: '2026-08-01' }),
  tx({ type: 'expense', categoryId: 'mer', amount: 1000000, date: '2026-08-10' }),
  tx({ type: 'expense', categoryId: 'ocio', amount: 300000, date: '2026-08-20' }),
  // septiembre
  tx({ type: 'income', categoryId: 'sal', amount: 4000000, date: '2026-09-01' }),
  tx({ type: 'expense', categoryId: 'mer', amount: 1500000, date: '2026-09-08', description: 'Mercado grande' }),
  tx({ type: 'expense', categoryId: 'ocio', amount: 200000, date: '2026-09-15' }),
  tx({ type: 'expense', categoryId: 'deu', amount: 500000, date: '2026-09-20' }),
  tx({ type: 'expense', categoryId: 'int', amount: 80000, date: '2026-09-20' }),
  tx({ type: 'transfer', goalId: 'g1', transferDirection: 'deposit', amount: 300000, date: '2026-09-25', accountId: 'a1' }),
];
const goals = [{ id: 'g1', name: 'Viaje', targetAmount: 3000000, currentAmount: 900000 }];
const budgets = [{ id: 'b1', categoryId: 'mer', limit: 1200000, scope: 'household' }, { id: 'b2', categoryId: 'ocio', limit: 400000, scope: 'household' }];
const review = buildMonthlyReview({ monthKey: '2026-09', transactions, categories, budgets, goals });

describe('previousMonthKey', () => {
  it('retrocede un mes, cruzando el año', () => {
    expect(previousMonthKey('2026-09')).toBe('2026-08');
    expect(previousMonthKey('2026-01')).toBe('2025-12');
  });
});

describe('buildMonthlyReview', () => {
  it('totales del mes y comparación con el anterior (solo operativos)', () => {
    expect(review.totals).toEqual({ income: 4000000, expense: 1780000, net: 2220000, savingsRate: 56 });
    expect(review.previous.expense).toBe(1300000);
    expect(review.change.expense).toBe(37);
    expect(review.change.income).toBe(0);
  });
  it('categorías con su variación frente al mes anterior', () => {
    expect(review.topCategories[0]).toMatchObject({ name: 'Mercado', amount: 1500000, previous: 1000000, changePct: 50 });
    expect(review.topCategories.map((c) => c.name)).not.toContain('Deudas y préstamos');
  });
  it('mayores gastos del mes, sin financiamiento', () => {
    expect(review.biggestExpenses[0]).toMatchObject({ description: 'Mercado grande', amount: 1500000 });
    expect(review.biggestExpenses.some((g) => g.amount === 500000)).toBe(false);
  });
  it('presupuestos: pasado, justo u ok', () => {
    const mer = review.budgets.find((b) => b.name === 'Mercado');
    expect(mer).toMatchObject({ spent: 1500000, pct: 125, status: 'pasado' });
    expect(review.budgets.find((b) => b.name === 'Ocio')).toMatchObject({ pct: 50, status: 'ok' });
    expect(review.budgets[0].name).toBe('Mercado'); // el más pasado primero
  });
  it('metas con lo aportado en el mes, y deudas pagadas', () => {
    expect(review.goals[0]).toMatchObject({ name: 'Viaje', contributed: 300000, progress: 30, remaining: 2100000 });
    expect(review.debt).toEqual({ capitalPaid: 500000, interestPaid: 80000 });
  });
  it('logros y alertas en lenguaje claro', () => {
    expect(review.wins.some((w) => w.includes('Ahorraron el 56 %'))).toBe(true);
    expect(review.wins.some((w) => w.includes('meta "Viaje"'))).toBe(true);
    expect(review.wins.some((w) => w.includes('capital'))).toBe(true);
    expect(review.watch.some((w) => w.includes('presupuesto de Mercado'))).toBe(true);
    expect(review.watch.some((w) => w.includes('Mercado subió 50 %'))).toBe(true);
  });
  it('un mes sin movimientos no tiene datos', () => {
    expect(buildMonthlyReview({ monthKey: '2027-05', transactions, categories }).hasData).toBe(false);
  });
  it('gastar más de lo que ingresó es una alerta', () => {
    const r = buildMonthlyReview({ monthKey: '2026-09', categories, transactions: [tx({ type: 'income', categoryId: 'sal', amount: 100, date: '2026-09-01' }), tx({ type: 'expense', categoryId: 'mer', amount: 300, date: '2026-09-02' })] });
    expect(r.watch[0]).toMatch(/Gastaron más de lo que ingresó/);
  });
  it('gastar menos que el mes anterior es un logro', () => {
    const r = buildMonthlyReview({ monthKey: '2026-09', categories, transactions: [
      tx({ type: 'expense', categoryId: 'mer', amount: 1000, date: '2026-08-02' }), tx({ type: 'expense', categoryId: 'mer', amount: 500, date: '2026-09-02' }), tx({ type: 'income', categoryId: 'sal', amount: 2000, date: '2026-09-01' }),
    ] });
    expect(r.wins.some((w) => w.includes('50 % menos'))).toBe(true);
  });
});

describe('decisiones', () => {
  it('crear, marcar y quitar', () => {
    const d = newDecision('  Bajar el gasto en ocio  ');
    expect(d).toMatchObject({ text: 'Bajar el gasto en ocio', done: false });
    const list = [d, newDecision('Otra')];
    expect(toggleDecision(list, d.id)[0].done).toBe(true);
    expect(toggleDecision(list, d.id)[1].done).toBe(false);
    expect(removeDecision(list, d.id)).toHaveLength(1);
  });
  it('los ids no se repiten', () => {
    expect(newDecision('a').id).not.toBe(newDecision('a').id);
  });
});
