import { describe, it, expect } from 'vitest';
import { assetValueAt, assetGain, summarizeAssets, assetRevaluation, creditBalanceAt, dayBefore } from './assets';
import { buildBalanceSheet, balanceSheetRows, buildEquityChanges, equityRows, balanceAt } from './balance';
import { periodRange } from './statements';

/* ------------------------------ activos ------------------------------ */
describe('assetValueAt', () => {
  const casa = { id: 'c', acquiredOn: '2024-01-10', acquisitionCost: 200000000, status: 'activo' };
  const vals = [{ date: '2025-06-01', value: 230000000 }, { date: '2026-06-01', value: 250000000 }];
  it('usa la última valoración anterior a la fecha, o el costo si aún no hay', () => {
    expect(assetValueAt(casa, vals, '2026-09-18')).toEqual({ value: 250000000, basis: 'valoracion' });
    expect(assetValueAt(casa, vals, '2025-12-31')).toEqual({ value: 230000000, basis: 'valoracion' });
    expect(assetValueAt(casa, vals, '2024-06-01')).toEqual({ value: 200000000, basis: 'costo' });
  });
  it('antes de adquirirse no existía', () => expect(assetValueAt(casa, vals, '2023-12-31')).toEqual({ value: 0, basis: 'no_existia' }));
  it('vendido: vale 0 desde la fecha de venta', () => {
    const vendida = { ...casa, status: 'vendido', soldOn: '2026-03-01', soldAmount: 240000000 };
    expect(assetValueAt(vendida, vals, '2026-02-28').value).toBe(230000000);
    expect(assetValueAt(vendida, vals, '2026-03-01')).toEqual({ value: 0, basis: 'vendido' });
  });
  it('una inversión con rentabilidad crece hasta el vencimiento y no más', () => {
    const cdt = { id: 'i', acquiredOn: '2026-01-01', acquisitionCost: 10000000, annualReturnRate: 10, maturityDate: '2026-12-31', status: 'activo' };
    const half = assetValueAt(cdt, [], '2026-07-02'); // 182 días
    expect(half.basis).toBe('estimado');
    expect(half.value).toBeCloseTo(10000000 * Math.pow(1.1, 182 / 365), 0);
    const after = assetValueAt(cdt, [], '2027-12-31');
    expect(after.value).toBeCloseTo(10000000 * Math.pow(1.1, 364 / 365), 0); // congelado al vencimiento
  });
  it('una valoración nueva reinicia el crecimiento estimado', () => {
    const cdt = { id: 'i', acquiredOn: '2026-01-01', acquisitionCost: 1000, annualReturnRate: 10, status: 'activo' };
    const v = assetValueAt(cdt, [{ date: '2026-06-01', value: 2000 }], '2026-06-01');
    expect(v.value).toBe(2000);
  });
  it('sin costo ni valoraciones vale 0', () => expect(assetValueAt({ id: 'x', status: 'activo' }, [], '2026-01-01').value).toBe(0));
});

describe('assetGain / summarizeAssets / dayBefore', () => {
  it('ganancia contra el costo', () => {
    expect(assetGain({ acquisitionCost: 100 }, 130)).toEqual({ amount: 30, pct: 30 });
    expect(assetGain({ acquisitionCost: 0 }, 130)).toBeNull();
  });
  it('resume por tipo solo lo que existe', () => {
    const s = summarizeAssets([
      { id: '1', kind: 'vehiculo', name: 'Carro', acquiredOn: '2020-01-01', acquisitionCost: 40, valuations: [], status: 'activo' },
      { id: '2', kind: 'vehiculo', name: 'Moto', acquiredOn: '2027-01-01', acquisitionCost: 10, valuations: [], status: 'activo' },
      { id: '3', kind: 'inversion', name: 'CDT', acquiredOn: '2026-01-01', acquisitionCost: 5, valuations: [], status: 'activo' },
    ], '2026-09-01');
    expect(s.total).toBe(45);
    expect(s.byKind.vehiculo.items).toHaveLength(1);
  });
  it('día anterior cruza mes y año', () => {
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
  });
});

describe('assetRevaluation', () => {
  const inv = { id: 'i', acquiredOn: '2026-09-10', acquisitionCost: 1000000, status: 'activo' };
  it('un activo comprado en el período no cuenta el costo como valorización', () => {
    expect(assetRevaluation(inv, [{ date: '2026-09-30', value: 1100000 }], '2026-09-01', '2026-09-30')).toBe(100000);
    expect(assetRevaluation(inv, [], '2026-09-01', '2026-09-30')).toBe(0);
  });
  it('una venta cuenta lo cobrado menos el valor en libros', () => {
    const casa = { id: 'c', acquiredOn: '2020-01-01', acquisitionCost: 100, status: 'vendido', soldOn: '2026-09-15', soldAmount: 130 };
    expect(assetRevaluation(casa, [{ date: '2025-01-01', value: 110 }], '2026-09-01', '2026-09-30')).toBe(20);
  });
  it('un activo ya existente que sube de valor', () => {
    const c = { id: 'c', acquiredOn: '2020-01-01', acquisitionCost: 100, status: 'activo' };
    expect(assetRevaluation(c, [{ date: '2026-09-20', value: 180 }], '2026-09-01', '2026-09-30')).toBe(80);
  });
});

describe('creditBalanceAt', () => {
  const credit = { principal: 1200, startDate: '2026-01-01' };
  const payments = [
    { installmentNumber: 1, dueDate: '2026-02-01', paid: true, paidDate: '2026-02-03', balanceAfter: 800 },
    { installmentNumber: 2, dueDate: '2026-03-01', paid: true, paidDate: null, balanceAfter: 400 },
    { installmentNumber: 3, dueDate: '2026-04-01', paid: false, balanceAfter: 0 },
  ];
  it('saldo tras la última cuota pagada hasta esa fecha', () => {
    expect(creditBalanceAt(credit, payments, '2026-01-31')).toBe(1200);
    expect(creditBalanceAt(credit, payments, '2026-02-02')).toBe(1200);
    expect(creditBalanceAt(credit, payments, '2026-02-03')).toBe(800);
    expect(creditBalanceAt(credit, payments, '2026-03-01')).toBe(400); // sin fecha de pago usa el vencimiento
    expect(creditBalanceAt(credit, payments, '2026-12-31')).toBe(400);
  });
  it('antes de empezar, 0; sin cuotas, el capital', () => {
    expect(creditBalanceAt(credit, payments, '2025-12-31')).toBe(0);
    expect(creditBalanceAt({ principal: 500 }, [], '2026-01-01')).toBe(500);
  });
});

/* ------------------------------ balance ------------------------------ */
const accounts = [
  { id: 'a1', name: 'Ahorros', type: 'individual', ownerIds: ['m1'], paymentKind: 'ahorros' },
  { id: 'tc', name: 'Visa', type: 'individual', ownerIds: ['m1'], paymentKind: 'tarjeta_credito' },
  { id: 'sh', name: 'Cuenta hogar', type: 'shared', ownerIds: ['m1', 'm2'], paymentKind: 'ahorros' },
  { id: 'a2', name: 'Ahorros de Luis', type: 'individual', ownerIds: ['m2'], paymentKind: 'ahorros' },
];
const categories = [
  { id: 'sal', name: 'Salario', type: 'income', nature: 'operativo' },
  { id: 'mer', name: 'Mercado', type: 'expense', nature: 'operativo' },
  { id: 'inv', name: 'Ahorro / Inversión', type: 'expense', nature: 'inversion' },
  { id: 'prest', name: 'Préstamos recibidos', type: 'income', nature: 'financiamiento' },
];
const tx = (o) => ({ id: Math.random().toString(36), memberId: 'm1', ...o });
const transactions = [
  tx({ type: 'income', accountId: 'a1', categoryId: 'sal', amount: 1000000, date: '2026-08-01', nature: 'apertura' }),
  tx({ type: 'income', accountId: 'a1', categoryId: 'sal', amount: 3000000, date: '2026-09-01' }),
  tx({ type: 'income', accountId: 'a1', categoryId: 'prest', amount: 2000000, date: '2026-09-03' }),
  tx({ type: 'expense', accountId: 'a1', categoryId: 'mer', amount: 500000, date: '2026-09-05' }),
  tx({ type: 'expense', accountId: 'a1', categoryId: 'inv', amount: 1000000, date: '2026-09-10' }),
  tx({ type: 'expense', accountId: 'tc', categoryId: 'mer', amount: 300000, date: '2026-09-12' }),
  tx({ type: 'income', accountId: 'sh', categoryId: 'sal', amount: 700000, date: '2026-09-02' }),
  tx({ type: 'income', accountId: 'a2', categoryId: 'sal', amount: 9999999, date: '2026-09-02', memberId: 'm2' }),
];
const assets = [
  { id: 'cdt', ownerMemberId: 'm1', name: 'CDT Bancolombia', kind: 'inversion', acquiredOn: '2026-09-10', acquisitionCost: 1000000, status: 'activo', valuations: [{ date: '2026-09-10', value: 1000000 }, { date: '2026-09-30', value: 1100000 }] },
  { id: 'casa', ownerMemberId: null, name: 'Apartamento', kind: 'propiedad', acquiredOn: '2020-01-01', acquisitionCost: 200000000, status: 'activo', valuations: [{ date: '2026-06-01', value: 250000000 }] },
];
const credits = [
  { credit: { id: 'k1', name: 'Libranza', ownerMemberId: 'm1', principal: 2000000, startDate: '2026-09-03', currency: 'COP' }, payments: [{ installmentNumber: 1, dueDate: '2026-10-03', paid: false, balanceAfter: 1000000 }] },
  { credit: { id: 'k2', name: 'Hipoteca', ownerMemberId: null, principal: 100000000, startDate: '2020-01-01', currency: 'COP' }, payments: [] },
  { credit: { id: 'k3', name: 'Crédito UVR', ownerMemberId: 'm1', principal: 1000, startDate: '2026-01-01', currency: 'UVR' }, payments: [] },
];
const base = { accounts, transactions, assets, creditsWithPayments: credits };
const personal = { kind: 'personal', memberId: 'm1' };

describe('buildBalanceSheet', () => {
  const sheet = buildBalanceSheet({ ...base, scope: personal, dateISO: '2026-09-30', uvrValue: 400 });
  it('efectivo solo de mis cuentas individuales; la tarjeta con deuda es pasivo', () => {
    expect(sheet.cash).toEqual([{ key: 'a1', label: 'Ahorros', amount: 4500000 }]);
    expect(sheet.cards).toEqual([{ key: 'tc', label: 'Visa', amount: 300000 }]);
    expect(sheet.totals.cash).toBe(4500000);
  });
  it('activos a su valor a la fecha, solo los míos; créditos míos con UVR convertida', () => {
    expect(sheet.assetGroups.map((g) => [g.kind, g.total])).toEqual([['inversion', 1100000]]);
    expect(sheet.credits.map((c) => [c.label, c.amount])).toEqual([['Libranza', 2000000], ['Crédito UVR', 400000]]);
  });
  it('patrimonio = activos − pasivos', () => {
    expect(sheet.totals.totalAssets).toBe(5600000);
    expect(sheet.totals.totalLiabilities).toBe(2700000);
    expect(sheet.totals.equity).toBe(2900000);
  });
  it('sin valor de la UVR, el crédito UVR se excluye y se avisa', () => {
    const s = buildBalanceSheet({ ...base, scope: personal, dateISO: '2026-09-30' });
    expect(s.uvrPending).toBe(true);
    expect(s.credits.map((c) => c.label)).toEqual(['Libranza']);
  });
  it('ámbito hogar: cuentas compartidas, y activos y créditos sin dueño', () => {
    const s = buildBalanceSheet({ ...base, scope: { kind: 'hogar' }, dateISO: '2026-09-30' });
    expect(s.cash.map((c) => c.label)).toEqual(['Cuenta hogar']);
    expect(s.assetGroups.map((g) => g.kind)).toEqual(['propiedad']);
    expect(s.credits.map((c) => c.label)).toEqual(['Hipoteca']);
    expect(s.totals.equity).toBe(700000 + 250000000 - 100000000);
  });
  it('nunca incluye lo de otro integrante', () => {
    const s = buildBalanceSheet({ ...base, scope: personal, dateISO: '2026-09-30', uvrValue: 400 });
    expect(JSON.stringify(s)).not.toContain('Ahorros de Luis');
    expect(s.totals.cash).toBe(4500000);
  });
  it('a una fecha anterior refleja solo lo registrado hasta ese día', () => {
    const s = buildBalanceSheet({ ...base, scope: personal, dateISO: '2026-09-04', uvrValue: 400 });
    expect(s.totals.cash).toBe(6000000); // 1M + 3M + 2M
    expect(s.assetGroups).toEqual([]); // el CDT se compró el 10
    expect(s.cards).toEqual([]);
  });
  it('ahorro apartado en objetivos: aportes menos retiros', () => {
    const t = [
      ...transactions,
      tx({ type: 'transfer', accountId: 'a1', goalId: 'g1', transferDirection: 'deposit', amount: 400000, date: '2026-09-15' }),
      tx({ type: 'transfer', accountId: 'a1', goalId: 'g1', transferDirection: 'withdraw', amount: 100000, date: '2026-09-20' }),
    ];
    const s = buildBalanceSheet({ ...base, transactions: t, scope: personal, dateISO: '2026-09-30', uvrValue: 400 });
    expect(s.totals.goals).toBe(300000);
    expect(s.totals.cash).toBe(4500000 - 400000 + 100000);
  });
  it('balanceAt suma lo registrado hasta la fecha', () => {
    expect(balanceAt(transactions, 'a1', '2026-08-31')).toBe(1000000);
  });
});

describe('balanceSheetRows', () => {
  const cur = buildBalanceSheet({ ...base, scope: personal, dateISO: '2026-09-30', uvrValue: 400 });
  const prev = buildBalanceSheet({ ...base, scope: personal, dateISO: '2026-08-31', uvrValue: 400 });
  it('tiene activos, pasivos y patrimonio con sus totales', () => {
    const rows = balanceSheetRows(cur);
    const find = (label) => rows.find((r) => r.label === label);
    expect(find('TOTAL ACTIVOS').amount).toBe(5600000);
    expect(find('TOTAL PASIVOS').amount).toBe(2700000);
    expect(find('PATRIMONIO (activos − pasivos)').amount).toBe(2900000);
    expect(rows.some((r) => r.label === 'Tarjetas de crédito')).toBe(true);
  });
  it('con comparativo trae el período anterior y la variación', () => {
    const rows = balanceSheetRows(cur, prev);
    const eq = rows.find((r) => r.label === 'PATRIMONIO (activos − pasivos)');
    expect(eq.previous).toBe(600000);
    expect(eq.delta).toBe(2300000);
    // lo que solo existe hoy aparece con anterior 0
    expect(rows.find((r) => r.label === 'CDT Bancolombia').previous).toBe(0);
  });
});

describe('buildEquityChanges', () => {
  const range = periodRange('mes', 2026, 8); // septiembre 2026
  const eq = buildEquityChanges({ ...base, categories, scope: personal, range, uvrValue: 400 });
  it('el patrimonio final menos el inicial se explica por sus partes', () => {
    expect(eq.opening).toBe(1000000 - 400000); // el saldo inicial menos el crédito UVR, que ya existía
    expect(eq.closing - eq.opening).toBe(eq.operating + eq.apertura + eq.traspasos + eq.revaluation + eq.other);
  });
  it('resultado operativo y valorización', () => {
    expect(eq.operating).toBe(3000000 - 500000 - 300000);
    expect(eq.revaluation).toBe(100000);
    expect(eq.revaluationDetail).toEqual([{ name: 'CDT Bancolombia', amount: 100000 }]);
  });
  it('los préstamos y la inversión no mueven el patrimonio: nada queda sin explicar', () => {
    expect(eq.other).toBe(0);
  });
  it('las filas incluyen inicio, partes y fin', () => {
    const rows = equityRows(eq);
    expect(rows[0].label).toBe('Patrimonio al inicio del período');
    expect(rows[rows.length - 2].label).toBe('Patrimonio al final del período');
    expect(rows[rows.length - 2].amount).toBe(eq.closing);
  });
});
