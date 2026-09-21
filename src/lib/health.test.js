import { describe, it, expect } from 'vitest';
import { computeHealth, previousMonthKeys, levelFor } from './health';

const TODAY = '2026-09-18';
const categories = [
  { id: 'sal', name: 'Salario', type: 'income', nature: 'operativo' },
  { id: 'mer', name: 'Mercado', type: 'expense', nature: 'operativo' },
  { id: 'deu', name: 'Deudas', type: 'expense', nature: 'financiamiento' },
];
const accounts = [
  { id: 'a1', name: 'Ahorros', paymentKind: 'ahorros', type: 'individual', ownerIds: ['m1'] },
  { id: 'tc', name: 'Visa', paymentKind: 'tarjeta_credito', type: 'individual', ownerIds: ['m1'] },
];
const tx = (o) => ({ id: Math.random().toString(36), memberId: 'm1', accountId: 'a1', ...o });
// junio, julio y agosto: ingresa 4.000.000 y gasta 3.000.000 (25 % de ahorro)
const months = ['2026-06', '2026-07', '2026-08'];
const base = months.flatMap((m) => [
  tx({ type: 'income', categoryId: 'sal', amount: 4000000, date: `${m}-01` }),
  tx({ type: 'expense', categoryId: 'mer', amount: 3000000, date: `${m}-10` }),
]);

describe('previousMonthKeys', () => {
  it('los meses completos anteriores, en orden, cruzando el año', () => {
    expect(previousMonthKeys('2026-09-18', 3)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(previousMonthKeys('2026-01-05', 3)).toEqual(['2025-10', '2025-11', '2025-12']);
  });
});

describe('computeHealth', () => {
  it('sin datos suficientes no inventa un puntaje', () => {
    const r = computeHealth({ transactions: [], categories, accounts, todayISO: TODAY });
    expect(r.score).toBeNull();
    expect(r.reason).toMatch(/al menos un mes completo/);
    // solo gastos, sin ingresos: tampoco
    expect(computeHealth({ transactions: [tx({ type: 'expense', categoryId: 'mer', amount: 5, date: '2026-08-02' })], categories, accounts, todayISO: TODAY }).score).toBeNull();
  });

  it('tasa de ahorro del 25 % da puntaje pleno en ese indicador', () => {
    const r = computeHealth({ transactions: base, categories, accounts, todayISO: TODAY });
    const ahorro = r.components.find((c) => c.id === 'ahorro');
    expect(ahorro.value).toBe(25);
    expect(ahorro.score).toBe(100);
    expect(r.averages).toMatchObject({ income: 4000000, expense: 3000000, savingsRate: 25 });
  });

  it('fondo de emergencia: efectivo (sin tarjetas) entre el gasto mensual', () => {
    // saldo en ahorros = 3 x (4.000.000 - 3.000.000) = 3.000.000 → 1 mes de gastos
    const r = computeHealth({ transactions: base, categories, accounts, todayISO: TODAY });
    const fondo = r.components.find((c) => c.id === 'emergencia');
    expect(fondo.value).toBe(1);
    expect(fondo.score).toBeCloseTo(16.7, 1);
  });

  it('la tarjeta con deuda no cuenta como efectivo', () => {
    const t = [...base, tx({ type: 'expense', categoryId: 'mer', amount: 9000000, accountId: 'tc', date: '2026-08-20' })];
    const r = computeHealth({ transactions: t, categories, accounts, todayISO: TODAY });
    expect(r.components.find((c) => c.id === 'emergencia').value).toBeLessThan(1.1);
  });

  it('carga de deuda: cuotas del mes / ingreso mensual', () => {
    const credits = [{ credit: { status: 'activo' }, payments: [{ installmentNumber: 1, paid: true, total: 1 }, { installmentNumber: 2, paid: false, total: 1000000 }] }];
    const r = computeHealth({ transactions: base, categories, accounts, creditsWithPayments: credits, todayISO: TODAY });
    const deuda = r.components.find((c) => c.id === 'deuda');
    expect(deuda.value).toBe(25);
    expect(deuda.score).toBe(50); // (35 - 25) / 20
  });

  it('sin deudas el indicador de deuda es perfecto', () => {
    const r = computeHealth({ transactions: base, categories, accounts, todayISO: TODAY });
    expect(r.components.find((c) => c.id === 'deuda').score).toBe(100);
  });

  it('presupuestos: el porcentaje de los que siguen dentro de su límite este mes', () => {
    const t = [...base, tx({ type: 'expense', categoryId: 'mer', amount: 700000, date: '2026-09-05' })];
    const budgets = [{ id: 'b1', categoryId: 'mer', limit: 500000, scope: 'household' }, { id: 'b2', categoryId: 'sal', limit: 100, scope: 'household' }];
    const r = computeHealth({ transactions: t, categories, accounts, budgets, todayISO: TODAY });
    const p = r.components.find((c) => c.id === 'presupuestos');
    expect(p.value).toBe(50);
  });

  it('los movimientos de financiamiento (capital de deudas) no cuentan como gasto', () => {
    const t = [...base, tx({ type: 'expense', categoryId: 'deu', amount: 2000000, date: '2026-08-15' })];
    const r = computeHealth({ transactions: t, categories, accounts, todayISO: TODAY });
    expect(r.averages.expense).toBe(3000000);
  });

  it('puntaje total ponderado, nivel y consejo sobre lo más débil', () => {
    const r = computeHealth({ transactions: base, categories, accounts, todayISO: TODAY });
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.weakest).toBe('emergencia');
    expect(r.tip).toMatch(/colchón/);
    expect(r.level).toBe(levelFor(r.score));
  });

  it('un mes con datos alcanza; los meses vacíos no promedian', () => {
    const one = [tx({ type: 'income', categoryId: 'sal', amount: 2000000, date: '2026-08-01' }), tx({ type: 'expense', categoryId: 'mer', amount: 1000000, date: '2026-08-05' })];
    const r = computeHealth({ transactions: one, categories, accounts, todayISO: TODAY });
    expect(r.months).toBe(1);
    expect(r.averages.savingsRate).toBe(50);
  });
});

describe('levelFor', () => {
  it('cortes de nivel', () => {
    expect([100, 80, 79, 60, 59, 40, 39, 0].map(levelFor)).toEqual(['Excelente', 'Excelente', 'Buena', 'Buena', 'Regular', 'Regular', 'Por mejorar', 'Por mejorar']);
  });
});
