// Ayuda para la declaración de renta de personas naturales (Colombia) — lógica pura y ORIENTATIVA.
// Junta lo ya registrado (ingresos por tipo, gastos que pueden ser deducibles) y avisa si por los topes de la DIAN
// probablemente toca declarar. No calcula el impuesto ni reemplaza a un contador: las reglas y el valor de la UVT
// cambian cada año, por eso la UVT es editable y los topes están a la vista.
import { accountsInScope, resultAmount } from './statements.js';
import { effectiveNature } from './accounting.js';
import { buildBalanceSheet } from './balance.js';
import { csvCell } from './dataExport.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Valor de la UVT por año gravable (verifica el de la DIAN antes de presentar).
export const UVT_BY_YEAR = { 2023: 42412, 2024: 47065, 2025: 49799, 2026: 52374 };
export function defaultUvt(year) {
  if (UVT_BY_YEAR[year]) return UVT_BY_YEAR[year];
  const years = Object.keys(UVT_BY_YEAR).map(Number);
  return UVT_BY_YEAR[year > Math.max(...years) ? Math.max(...years) : Math.min(...years)];
}

export const TAX_TAGS = [
  { id: 'laboral', kind: 'income', label: 'Ingreso laboral', hint: 'Salario, honorarios, prestaciones' },
  { id: 'capital', kind: 'income', label: 'Ingreso de capital', hint: 'Arriendos, intereses y rendimientos' },
  { id: 'vivienda', kind: 'expense', label: 'Intereses de vivienda', hint: 'Crédito hipotecario o leasing habitacional', capUvt: 1200, note: 'Hasta 1.200 UVT al año' },
  { id: 'salud', kind: 'expense', label: 'Medicina prepagada y salud', hint: 'Prepagada y seguros de salud', capUvt: 192, note: 'Hasta 16 UVT al mes (192 al año)' },
  { id: 'educacion', kind: 'expense', label: 'Intereses de crédito educativo', hint: 'ICETEX y similares', capUvt: 100, note: 'Hasta 100 UVT al año' },
  { id: 'afc', kind: 'expense', label: 'Aportes AFC / pensión voluntaria', hint: 'Cuentas AFC y fondos de pensión voluntaria', capUvt: 3800, capPct: 30, note: 'Hasta el 30 % del ingreso y 3.800 UVT al año' },
  { id: 'donaciones', kind: 'expense', label: 'Donaciones', hint: 'A entidades sin ánimo de lucro con certificado', capPct: 25, note: 'Hasta el 25 % de la renta líquida (aquí, aprox. sobre tus ingresos)' },
  { id: 'gmf', kind: 'expense', label: 'GMF (4x1000)', hint: 'Gravamen a los movimientos financieros', factor: 0.5, note: 'El 50 % de lo pagado' },
];
export const taxTagLabel = (id) => TAX_TAGS.find((t) => t.id === id)?.label || '';
export const taxTagsFor = (categoryType) => TAX_TAGS.filter((t) => t.kind === (categoryType === 'income' ? 'income' : 'expense'));

// Topes de obligación de declarar (año gravable), en UVT: patrimonio bruto y, en el año, ingresos, consumos con
// tarjeta de crédito, compras y consumos, y consignaciones.
export const FILING_LIMITS = { patrimonio: 4500, ingresos: 1400, tarjeta: 1400, compras: 1400, consignaciones: 1400 };
export const GLOBAL_CAP = { pct: 40, uvt: 1340 };

export function buildTaxSummary({ transactions, categories, accounts, assets, creditsWithPayments, scope, year, uvt, uvrValue }) {
  const catById = Object.fromEntries((categories || []).map((c) => [c.id, c]));
  const scopeAccounts = accountsInScope(accounts, scope);
  const accById = Object.fromEntries(scopeAccounts.map((a) => [a.id, a]));
  const inYear = (transactions || []).filter((t) => (t.type === 'income' || t.type === 'expense') && String(t.date || '').slice(0, 4) === String(year) && accById[t.accountId]);

  const incomeByTag = { laboral: 0, capital: 0, otros: 0 };
  const incomeCats = new Map();
  const deductionCats = {};
  const details = [];
  let loans = 0; let assetSales = 0;
  let cardSpend = 0; let purchases = 0; let deposits = 0;

  inYear.forEach((t) => {
    const cat = catById[t.categoryId];
    const nature = effectiveNature(t, cat);
    if (nature === 'apertura') return;
    const account = accById[t.accountId];
    if (t.type === 'income') {
      if (account.paymentKind !== 'efectivo') deposits += t.amount;
      if (nature === 'financiamiento') { loans += t.amount; return; }
      if (nature === 'inversion') { assetSales += t.amount; return; }
      const tag = cat?.taxTag === 'laboral' || cat?.taxTag === 'capital' ? cat.taxTag : 'otros';
      incomeByTag[tag] += t.amount;
      const key = cat?.id || 'sin-categoria';
      const cur = incomeCats.get(key) || { categoryId: cat?.id || null, name: cat?.name || 'Sin categoría', tag, amount: 0 };
      cur.amount += t.amount; incomeCats.set(key, cur);
      details.push({ date: t.date, kind: 'Ingreso', category: cur.name, tag: taxTagLabel(tag) || 'Otros ingresos', description: t.description || '', amount: t.amount });
      return;
    }
    const amount = resultAmount(t, scope);
    if (nature === 'operativo') {
      purchases += amount;
      if (account.paymentKind === 'tarjeta_credito') cardSpend += amount;
    }
    const tag = TAX_TAGS.find((x) => x.id === cat?.taxTag && x.kind === 'expense');
    if (tag && nature === 'operativo') {
      const byCat = (deductionCats[tag.id] ||= new Map());
      const cur = byCat.get(cat.id) || { categoryId: cat.id, name: cat.name, amount: 0 };
      cur.amount += amount; byCat.set(cat.id, cur);
      details.push({ date: t.date, kind: 'Gasto', category: cat.name, tag: tag.label, description: t.description || '', amount });
    }
  });

  const income = {
    laboral: round2(incomeByTag.laboral), capital: round2(incomeByTag.capital), otros: round2(incomeByTag.otros),
    total: round2(incomeByTag.laboral + incomeByTag.capital + incomeByTag.otros),
    byCategory: [...incomeCats.values()].map((c) => ({ ...c, amount: round2(c.amount) })).sort((a, b) => b.amount - a.amount),
  };

  const deductions = TAX_TAGS.filter((t) => t.kind === 'expense').map((tag) => {
    const byCategory = [...(deductionCats[tag.id]?.values() || [])].map((c) => ({ ...c, amount: round2(c.amount) })).sort((a, b) => b.amount - a.amount);
    const total = round2(byCategory.reduce((s, c) => s + c.amount, 0));
    let allowed = total;
    if (tag.factor) allowed = total * tag.factor;
    if (tag.capUvt) allowed = Math.min(allowed, tag.capUvt * uvt);
    if (tag.capPct) allowed = Math.min(allowed, (tag.capPct / 100) * (income.laboral + income.capital));
    allowed = round2(allowed);
    return { tag: tag.id, label: tag.label, note: tag.note, total, allowed, excess: round2(total - allowed), byCategory };
  }).filter((d) => d.total > 0);
  const allowedTotal = round2(deductions.reduce((s, d) => s + d.allowed, 0));
  const globalCap = round2(Math.min((GLOBAL_CAP.pct / 100) * income.total, GLOBAL_CAP.uvt * uvt));
  const allowedWithinCap = round2(Math.min(allowedTotal, globalCap));

  const sheet = buildBalanceSheet({ accounts, transactions, assets, creditsWithPayments, scope, dateISO: `${year}-12-31`, uvrValue });
  const measures = [
    { id: 'patrimonio', label: 'Patrimonio bruto al 31 de diciembre', value: sheet.totals.totalAssets },
    { id: 'ingresos', label: 'Ingresos brutos del año', value: income.total },
    { id: 'tarjeta', label: 'Consumos con tarjeta de crédito', value: round2(cardSpend) },
    { id: 'compras', label: 'Compras y consumos', value: round2(purchases) },
    { id: 'consignaciones', label: 'Consignaciones y depósitos', value: round2(deposits) },
  ].map((m) => {
    const limitUvt = FILING_LIMITS[m.id];
    const limit = round2(limitUvt * uvt);
    return { ...m, limitUvt, limit, reached: m.value >= limit, pct: limit > 0 ? Math.min(100, Math.round((m.value / limit) * 100)) : 0 };
  });

  return {
    year, uvt, income, deductions, allowedTotal, globalCap, allowedWithinCap,
    thresholds: measures, mustFile: measures.some((m) => m.reached),
    other: { loans: round2(loans), assetSales: round2(assetSales) },
    uvrPending: sheet.uvrPending, details: details.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

const money = (n) => String(round2(n)).replace('.', ',');

// CSV para Excel en español (separador ";"): resumen del año y el detalle de lo etiquetado.
export function taxSummaryCsv(summary, { title = 'Resumen para declaración de renta' } = {}) {
  const rows = [
    [title], [`Año gravable ${summary.year}`, `UVT ${money(summary.uvt)}`], [],
    ['INGRESOS'], ['Concepto', 'Valor'],
    ['Laborales', money(summary.income.laboral)], ['De capital', money(summary.income.capital)], ['Otros / sin clasificar', money(summary.income.otros)], ['Total ingresos', money(summary.income.total)], [],
    ['POSIBLES DEDUCCIONES'], ['Concepto', 'Pagado en el año', 'Tope orientativo', 'Aprovechable'],
    ...summary.deductions.map((d) => [d.label, money(d.total), d.note, money(d.allowed)]),
    ['Total aprovechable', '', `Límite global ${money(summary.globalCap)}`, money(summary.allowedWithinCap)], [],
    ['¿OBLIGADO A DECLARAR?', summary.mustFile ? 'Probablemente sí' : 'Probablemente no'], ['Criterio', 'Valor', 'Tope', 'Alcanzado'],
    ...summary.thresholds.map((m) => [m.label, money(m.value), money(m.limit), m.reached ? 'Sí' : 'No']), [],
    ['DETALLE'], ['Fecha', 'Tipo', 'Categoría', 'Uso tributario', 'Descripción', 'Valor'],
    ...summary.details.map((d) => [d.date, d.kind, d.category, d.tag, d.description, money(d.amount)]),
    [], ['Documento orientativo generado por la app; no reemplaza la asesoría de un contador ni las reglas vigentes de la DIAN.'],
  ];
  return rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}
