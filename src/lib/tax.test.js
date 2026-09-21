import { describe, it, expect } from 'vitest';
import { buildTaxSummary, taxSummaryCsv, defaultUvt, UVT_BY_YEAR, taxTagsFor, taxTagLabel } from './tax';

const UVT = 50000;
const accounts = [
  { id: 'bank', name: 'Ahorros', type: 'individual', ownerIds: ['u1'], paymentKind: 'ahorros' },
  { id: 'cash', name: 'Efectivo', type: 'individual', ownerIds: ['u1'], paymentKind: 'efectivo' },
  { id: 'card', name: 'Visa', type: 'individual', ownerIds: ['u1'], paymentKind: 'tarjeta_credito' },
  { id: 'shared', name: 'Compartida', type: 'shared', ownerIds: ['u1', 'u2'], paymentKind: 'ahorros' },
];
const cat = (id, name, type, extra = {}) => ({ id, name, type, nature: 'operativo', ...extra });
const categories = [
  cat('sal', 'Salario', 'income', { taxTag: 'laboral' }),
  cat('ren', 'Rentas', 'income', { taxTag: 'capital' }),
  cat('otr', 'Otros ingresos', 'income'),
  cat('prest', 'Préstamos recibidos', 'income', { nature: 'financiamiento' }),
  cat('venta', 'Venta de activos', 'income', { nature: 'inversion' }),
  cat('viv', 'Intereses hipoteca', 'expense', { taxTag: 'vivienda' }),
  cat('sal2', 'Prepagada', 'expense', { taxTag: 'salud' }),
  cat('gmf', '4x1000', 'expense', { taxTag: 'gmf' }),
  cat('afc', 'AFC', 'expense', { taxTag: 'afc' }),
  cat('don', 'Donaciones', 'expense', { taxTag: 'donaciones' }),
  cat('super', 'Supermercado', 'expense'),
];
let n = 0;
const tx = (type, accountId, categoryId, amount, date = '2025-06-15', extra = {}) => ({ id: `t${++n}`, type, accountId, categoryId, amount, date, ...extra });
const base = { categories, accounts, assets: [], creditsWithPayments: [], scope: { kind: 'personal', memberId: 'u1' }, year: 2025, uvt: UVT };

describe('ingresos', () => {
  const transactions = [
    tx('income', 'bank', 'sal', 100_000_000), tx('income', 'bank', 'ren', 20_000_000), tx('income', 'bank', 'otr', 5_000_000),
    tx('income', 'bank', 'prest', 30_000_000), tx('income', 'bank', 'venta', 10_000_000),
    tx('income', 'bank', 'sal', 1_000_000, '2025-01-01', { nature: 'apertura' }),
    tx('income', 'bank', 'sal', 9_000_000, '2024-12-31'), // otro año
    tx('income', 'shared', 'sal', 8_000_000), // otro ámbito
  ];
  const s = buildTaxSummary({ ...base, transactions });
  it('separa laborales, de capital y otros; el préstamo y la venta de activos no son ingreso del año', () => {
    expect(s.income).toMatchObject({ laboral: 100_000_000, capital: 20_000_000, otros: 5_000_000, total: 125_000_000 });
    expect(s.other).toEqual({ loans: 30_000_000, assetSales: 10_000_000 });
  });
  it('ignora saldos iniciales, otros años y otras cuentas', () => {
    expect(s.income.byCategory.map((c) => c.name)).toEqual(['Salario', 'Rentas', 'Otros ingresos']);
  });
  it('en el ámbito del hogar mira las cuentas compartidas', () => {
    const h = buildTaxSummary({ ...base, transactions, scope: { kind: 'hogar' } });
    expect(h.income.laboral).toBe(8_000_000);
  });
});

describe('deducciones y topes', () => {
  const transactions = [
    tx('income', 'bank', 'sal', 100_000_000), tx('income', 'bank', 'ren', 20_000_000),
    tx('expense', 'bank', 'viv', 100_000_000), // tope 1.200 UVT = 60 M
    tx('expense', 'bank', 'sal2', 5_000_000), // bajo el tope de 192 UVT = 9,6 M
    tx('expense', 'bank', 'gmf', 1_000_000),
    tx('expense', 'bank', 'afc', 50_000_000), // 30 % de 120 M = 36 M
    tx('expense', 'bank', 'don', 40_000_000), // 25 % de 120 M = 30 M
    tx('expense', 'bank', 'super', 3_000_000), // sin etiqueta: no es deducción
  ];
  const s = buildTaxSummary({ ...base, transactions });
  const by = Object.fromEntries(s.deductions.map((d) => [d.tag, d]));
  it('aplica el tope en UVT', () => {
    expect(by.vivienda).toMatchObject({ total: 100_000_000, allowed: 60_000_000, excess: 40_000_000 });
    expect(by.salud).toMatchObject({ total: 5_000_000, allowed: 5_000_000, excess: 0 });
  });
  it('el 4x1000 cuenta al 50 %', () => { expect(by.gmf.allowed).toBe(500_000); });
  it('AFC y donaciones se limitan por porcentaje del ingreso', () => {
    expect(by.afc.allowed).toBe(36_000_000);
    expect(by.donaciones.allowed).toBe(30_000_000);
  });
  it('lo que no tiene etiqueta no aparece', () => { expect(s.deductions.some((d) => d.tag === 'super')).toBe(false); });
  it('el total aprovechable respeta el límite global (40 % del ingreso o 1.340 UVT)', () => {
    expect(s.allowedTotal).toBe(60_000_000 + 5_000_000 + 500_000 + 36_000_000 + 30_000_000);
    expect(s.globalCap).toBe(Math.min(0.4 * 120_000_000, 1340 * UVT)); // 48 M
    expect(s.allowedWithinCap).toBe(48_000_000);
  });
  it('un gasto etiquetado que no es operativo (ej. ahorro) no cuenta', () => {
    const t2 = [tx('income', 'bank', 'sal', 100_000_000), tx('expense', 'bank', 'viv', 5_000_000, '2025-03-01', { nature: 'financiamiento' })];
    expect(buildTaxSummary({ ...base, transactions: t2 }).deductions).toEqual([]);
  });
});

describe('¿debo declarar?', () => {
  it('sin nada cerca de los topes, probablemente no', () => {
    const s = buildTaxSummary({ ...base, transactions: [tx('income', 'bank', 'sal', 10_000_000), tx('expense', 'bank', 'super', 2_000_000)] });
    expect(s.mustFile).toBe(false);
    expect(s.thresholds.find((m) => m.id === 'ingresos')).toMatchObject({ limit: 1400 * UVT, reached: false });
  });
  it('los ingresos del año sobre 1.400 UVT obligan', () => {
    const s = buildTaxSummary({ ...base, transactions: [tx('income', 'bank', 'sal', 70_000_000)] });
    expect(s.thresholds.find((m) => m.id === 'ingresos').reached).toBe(true);
    expect(s.mustFile).toBe(true);
  });
  it('los consumos con tarjeta y las compras se miden aparte', () => {
    const s = buildTaxSummary({ ...base, transactions: [tx('expense', 'card', 'super', 40_000_000), tx('expense', 'bank', 'super', 35_000_000)] });
    const m = Object.fromEntries(s.thresholds.map((x) => [x.id, x]));
    expect(m.tarjeta.value).toBe(40_000_000);
    expect(m.tarjeta.reached).toBe(false);
    expect(m.compras.value).toBe(75_000_000);
    expect(m.compras.reached).toBe(true);
  });
  it('un gasto compartido cuenta solo por mi parte', () => {
    const shared = tx('expense', 'bank', 'super', 1_000_000, '2025-05-05', { isShared: true, participants: [{ memberId: 'u1', share: 400_000 }, { memberId: 'u2', share: 600_000 }] });
    expect(buildTaxSummary({ ...base, transactions: [shared] }).thresholds.find((m) => m.id === 'compras').value).toBe(400_000);
  });
  it('las consignaciones no cuentan el efectivo', () => {
    const s = buildTaxSummary({ ...base, transactions: [tx('income', 'bank', 'sal', 2_000_000), tx('income', 'cash', 'otr', 9_000_000)] });
    expect(s.thresholds.find((m) => m.id === 'consignaciones').value).toBe(2_000_000);
  });
  it('el patrimonio bruto al 31 de diciembre suma lo que hay en cuentas', () => {
    const s = buildTaxSummary({ ...base, transactions: [tx('income', 'bank', 'sal', 240_000_000, '2025-02-01'), tx('income', 'bank', 'sal', 99_000_000, '2026-01-02')] });
    const p = s.thresholds.find((m) => m.id === 'patrimonio');
    expect(p.value).toBe(240_000_000);
    expect(p.limit).toBe(4500 * UVT);
    expect(p.reached).toBe(true);
  });
});

describe('utilidades', () => {
  it('UVT por año, y el más cercano si el año no está', () => {
    expect(defaultUvt(2025)).toBe(UVT_BY_YEAR[2025]);
    expect(defaultUvt(2040)).toBe(UVT_BY_YEAR[2026]);
    expect(defaultUvt(2010)).toBe(UVT_BY_YEAR[2023]);
  });
  it('etiquetas por tipo de categoría', () => {
    expect(taxTagsFor('income').map((t) => t.id)).toEqual(['laboral', 'capital']);
    expect(taxTagsFor('expense').map((t) => t.id)).toContain('vivienda');
    expect(taxTagLabel('salud')).toBe('Medicina prepagada y salud');
    expect(taxTagLabel('nada')).toBe('');
  });
  it('el CSV trae resumen, deducciones, criterios y detalle con coma decimal', () => {
    const s = buildTaxSummary({ ...base, transactions: [tx('income', 'bank', 'sal', 1500.5), tx('expense', 'bank', 'sal2', 100, '2025-04-04', { description: 'Sura; plan' })] });
    const csv = taxSummaryCsv(s);
    expect(csv).toContain('Año gravable 2025;UVT 50000');
    expect(csv).toContain('Laborales;1500,5');
    expect(csv).toContain('Medicina prepagada y salud;100;');
    expect(csv).toContain('"Sura; plan"');
    expect(csv).toContain('Probablemente no');
    expect(csv).toContain('no reemplaza la asesoría');
  });
});
