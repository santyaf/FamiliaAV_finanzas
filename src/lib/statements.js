// Estados financieros (Fase 17): Estado de Resultados y Flujo de Efectivo, por
// mes, trimestre, semestre o año, de las finanzas PERSONALES (mis cuentas
// individuales) o del HOGAR (las cuentas compartidas). Lógica pura, sin React
// ni red, para probarla a fondo.
//
// Reglas contables que aplica (ver accounting.js):
//  - Solo cuentan movimientos de las cuentas del ámbito elegido. Personal = mis
//    cuentas individuales; Hogar = cuentas compartidas. Así el informe del hogar
//    es el mismo para todos los integrantes y nunca incluye lo privado de otros.
//  - Estado de Resultados: ingresos y gastos OPERATIVOS. Un préstamo recibido
//    cuenta como ingreso en una línea aparte ("financiamiento"); el capital de
//    una deuda pagada, el ahorro/inversión y el saldo inicial de una cuenta NO
//    son gasto (van en "informativo" o se excluyen).
//  - En el ámbito personal, un gasto compartido pagado desde mi cuenta cuenta
//    solo por mi parte (la del reparto entre integrantes).
//  - Estado de Resultados usa los recurrentes mes a mes (como el Dashboard);
//    el Flujo de Efectivo usa solo lo efectivamente registrado, para que cuadre
//    con los saldos reales de las cuentas.
import { occurrencesInMonth } from './finance';
import { effectiveNature } from './accounting';

/* ------------------------------ períodos ------------------------------ */
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const PERIOD_TYPES = [
  { id: 'mes', label: 'Mensual', months: 1 },
  { id: 'trimestre', label: 'Trimestral', months: 3 },
  { id: 'semestre', label: 'Semestral', months: 6 },
  { id: 'anio', label: 'Anual', months: 12 },
];
const pad = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// El período de ese tipo que empieza en el mes `monthIndex` (0-11) del año
// `year` — o que lo contiene (el mes se ajusta al inicio del período).
export function periodRange(type, year, monthIndex) {
  const months = PERIOD_TYPES.find((p) => p.id === type).months;
  const startMonth = Math.floor(monthIndex / months) * months;
  const endMonth = startMonth + months - 1;
  const lastDay = new Date(Date.UTC(year, endMonth + 1, 0)).getUTCDate();
  const label = type === 'mes' ? `${MONTH_NAMES[startMonth]} ${year}`
    : type === 'trimestre' ? `T${startMonth / 3 + 1} ${year}`
      : type === 'semestre' ? `S${startMonth / 6 + 1} ${year}` : `${year}`;
  return {
    type, year, startMonth, label,
    start: `${year}-${pad(startMonth + 1)}-01`,
    end: `${year}-${pad(endMonth + 1)}-${pad(lastDay)}`,
    monthKeys: Array.from({ length: months }, (_, i) => `${year}-${pad(startMonth + i + 1)}`),
  };
}
export function periodContaining(type, isoDate) {
  return periodRange(type, Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1);
}
export function previousPeriod(range) {
  const months = PERIOD_TYPES.find((p) => p.id === range.type).months;
  let year = range.year;
  let startMonth = range.startMonth - months;
  if (startMonth < 0) { year -= 1; startMonth += 12; }
  return periodRange(range.type, year, startMonth);
}
// Los últimos `count` períodos de ese tipo, el más reciente primero.
export function recentPeriods(type, todayISO, count) {
  const list = [];
  let range = periodContaining(type, todayISO);
  for (let i = 0; i < count; i++) { list.push(range); range = previousPeriod(range); }
  return list;
}

/* ------------------------------- ámbito ------------------------------- */
export function accountsInScope(accounts, scope) {
  if (scope.kind === 'hogar') return accounts.filter((a) => a.type === 'shared');
  return accounts.filter((a) => a.type !== 'shared' && (a.ownerIds || []).includes(scope.memberId));
}

// Cuánto de un gasto/ingreso cuenta en el Estado de Resultados. En el ámbito
// personal, un gasto compartido cuenta solo por mi parte.
function resultAmount(t, scope) {
  if (scope.kind === 'personal' && t.type === 'expense' && t.isShared && Array.isArray(t.participants) && t.participants.length) {
    return t.participants.find((p) => p.memberId === scope.memberId)?.share || 0;
  }
  return t.amount;
}

// Cuántas veces cuenta un movimiento en el período (los recurrentes, una vez por
// cada ocurrencia mensual).
function occurrenceFactor(t, range) {
  if (t.recurring) return range.monthKeys.reduce((sum, key) => sum + occurrencesInMonth(t, key), 0);
  return t.date >= range.start && t.date <= range.end ? 1 : 0;
}

/* --------------------- estructura común: secciones --------------------- */
// Suma por categoría → grupos por rubro → total. `amounts`: Map categoryId → monto.
function buildSection(amounts, categoriesById) {
  const groups = new Map();
  amounts.forEach((amount, categoryId) => {
    const cat = categoriesById.get(categoryId);
    const groupName = cat?.groupName || 'Sin rubro';
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push({ categoryId: categoryId || null, name: cat?.name || 'Sin categoría', amount: round2(amount) });
  });
  const list = [...groups.entries()].map(([name, lines]) => {
    lines.sort((a, b) => b.amount - a.amount);
    return { name, total: round2(lines.reduce((s, l) => s + l.amount, 0)), lines };
  }).sort((a, b) => b.total - a.total);
  return { total: round2(list.reduce((s, g) => s + g.total, 0)), groups: list };
}
const add = (map, key, amount) => map.set(key, (map.get(key) || 0) + amount);
const categoryMap = (categories) => new Map(categories.map((c) => [c.id, c]));

/* -------------------------- Estado de Resultados -------------------------- */
export function buildIncomeStatement({ transactions, categories, accounts, range, scope }) {
  const catById = categoryMap(categories);
  const ids = new Set(accountsInScope(accounts, scope).map((a) => a.id));
  const b = { incOp: new Map(), incFin: new Map(), incInv: new Map(), expOp: new Map(), expFin: new Map(), expInv: new Map() };
  let fixed = 0;

  transactions.forEach((t) => {
    if ((t.type !== 'income' && t.type !== 'expense') || !ids.has(t.accountId)) return;
    const cat = catById.get(t.categoryId);
    const nature = effectiveNature(t, cat);
    if (nature === 'apertura') return;
    const factor = occurrenceFactor(t, range);
    if (!factor) return;
    const amount = resultAmount(t, scope) * factor;
    if (!amount) return;
    const key = t.categoryId || '';
    if (t.type === 'income') {
      add(nature === 'financiamiento' ? b.incFin : nature === 'inversion' ? b.incInv : b.incOp, key, amount);
    } else {
      add(nature === 'financiamiento' ? b.expFin : nature === 'inversion' ? b.expInv : b.expOp, key, amount);
      if (nature === 'operativo' && cat?.isFixed) fixed += amount;
    }
  });

  const ingresosOperativos = buildSection(b.incOp, catById);
  const ingresosFinanciamiento = buildSection(b.incFin, catById);
  const gastosOperativos = buildSection(b.expOp, catById);
  const totalIngresos = round2(ingresosOperativos.total + ingresosFinanciamiento.total);
  const resultadoOperativo = round2(ingresosOperativos.total - gastosOperativos.total);
  return {
    range, scope,
    ingresosOperativos, ingresosFinanciamiento, gastosOperativos,
    totals: {
      ingresosOperativos: ingresosOperativos.total, ingresosFinanciamiento: ingresosFinanciamiento.total, totalIngresos,
      gastosOperativos: gastosOperativos.total, gastosFijos: round2(fixed), gastosVariables: round2(gastosOperativos.total - fixed),
      resultadoOperativo, resultado: round2(totalIngresos - gastosOperativos.total),
    },
    // lo que NO es ingreso/gasto operativo pero conviene ver
    memo: {
      capitalDeuda: buildSection(b.expFin, catById).total,
      ahorroInversion: buildSection(b.expInv, catById).total,
      ventaActivos: buildSection(b.incInv, catById).total,
    },
    ratios: { tasaAhorro: ingresosOperativos.total > 0 ? round2((resultadoOperativo / ingresosOperativos.total) * 100) : null },
  };
}

/* ---------------------------- Flujo de Efectivo ---------------------------- */
// Efecto de un movimiento sobre el saldo de UNA cuenta (mismas reglas que el
// saldo de la pantalla Cuentas, para que el flujo cuadre con él).
export function accountDelta(t, accountId) {
  if (t.type === 'income') return t.accountId === accountId ? t.amount : 0;
  if (t.type === 'expense') return t.accountId === accountId ? -t.amount : 0;
  if (t.type === 'transfer') {
    if (t.goalId) return t.accountId === accountId ? (t.transferDirection === 'withdraw' ? t.amount : -t.amount) : 0;
    let d = 0;
    if (t.accountId === accountId) d -= t.amount;
    if (t.toAccountId === accountId) d += t.amount;
    return d;
  }
  return 0;
}

export function buildCashFlow({ transactions, categories, accounts, range, scope }) {
  const catById = categoryMap(categories);
  const scopeAccounts = accountsInScope(accounts, scope);
  const balanceWhere = (predicate) => round2(scopeAccounts.reduce((sum, a) => (
    sum + transactions.reduce((s, t) => (predicate(t) ? s + accountDelta(t, a.id) : s), 0)
  ), 0));
  const opening = balanceWhere((t) => t.date < range.start);
  const closing = balanceWhere((t) => t.date <= range.end);

  const inn = { operativo: new Map(), financiamiento: new Map(), inversion: new Map() };
  const out = { operativo: new Map(), financiamiento: new Map(), inversion: new Map() };
  let aportesObjetivos = 0; let traspasos = 0; let aperturas = 0;

  transactions.forEach((t) => {
    if (t.date < range.start || t.date > range.end) return;
    scopeAccounts.forEach((a) => {
      const delta = accountDelta(t, a.id);
      if (!delta) return;
      if (t.type === 'transfer') {
        if (t.goalId) aportesObjetivos += delta; else traspasos += delta;
        return;
      }
      const cat = catById.get(t.categoryId);
      const nature = effectiveNature(t, cat);
      if (nature === 'apertura') { aperturas += delta; return; }
      const key = t.categoryId || '';
      if (delta > 0) add(inn[nature] || inn.operativo, key, delta);
      else add(out[nature] || out.operativo, key, -delta);
    });
  });

  const activity = (nature) => {
    const entradas = buildSection(inn[nature], catById);
    const salidas = buildSection(out[nature], catById);
    return { entradas, salidas, neto: round2(entradas.total - salidas.total) };
  };
  const operacion = activity('operativo');
  const financiacion = activity('financiamiento');
  const inversionBase = activity('inversion');
  const inversion = { ...inversionBase, aportesObjetivos: round2(aportesObjetivos), neto: round2(inversionBase.neto + aportesObjetivos) };
  const otros = { aperturas: round2(aperturas), traspasos: round2(traspasos), neto: round2(aperturas + traspasos) };
  const flujoNeto = round2(operacion.neto + financiacion.neto + inversion.neto + otros.neto);
  return {
    range, scope, opening, closing,
    operacion, financiacion, inversion, otros, flujoNeto,
    calculatedClosing: round2(opening + flujoNeto),
    difference: round2(opening + flujoNeto - closing), // debe ser 0: el flujo cuadra con los saldos
  };
}

/* ------------------------- filas para pantalla/export ------------------------- */
// Cada fila: { kind, label, level, amount, previous, delta, pct }.
// kinds: title | group | line | subtotal | total | memo | note
function row(kind, label, level, amount = null, previous = null) {
  const hasBoth = amount !== null && previous !== null;
  const delta = hasBoth ? round2(amount - previous) : null;
  return { kind, label, level, amount, previous, delta, pct: hasBoth && previous !== 0 ? round2((delta / Math.abs(previous)) * 100) : null };
}

// Une las líneas de dos períodos por clave, para que el comparativo muestre
// también lo que solo existió en uno de ellos.
function sectionRows(cur, prev, level) {
  const rows = [];
  const names = new Set([...cur.groups.map((g) => g.name), ...(prev?.groups || []).map((g) => g.name)]);
  const groupOf = (section, name) => section?.groups.find((g) => g.name === name);
  [...names].sort((a, b) => (groupOf(cur, b)?.total || 0) - (groupOf(cur, a)?.total || 0) || a.localeCompare(b)).forEach((name) => {
    const cg = groupOf(cur, name); const pg = groupOf(prev, name);
    rows.push(row('group', name, level, cg?.total || 0, prev ? (pg?.total || 0) : null));
    const keys = new Map();
    (cg?.lines || []).forEach((l) => keys.set(l.categoryId, l.name));
    (pg?.lines || []).forEach((l) => keys.set(l.categoryId, l.name));
    [...keys.entries()].map(([id, label]) => ({
      label, amount: cg?.lines.find((l) => l.categoryId === id)?.amount || 0, previous: pg?.lines.find((l) => l.categoryId === id)?.amount || 0,
    })).sort((a, b) => b.amount - a.amount || b.previous - a.previous).forEach((l) => {
      rows.push(row('line', l.label, level + 1, l.amount, prev ? l.previous : null));
    });
  });
  return rows;
}

export function incomeStatementRows(cur, prev = null) {
  const t = cur.totals; const p = prev?.totals;
  const pv = (key) => (p ? p[key] : null);
  const rows = [row('title', 'INGRESOS OPERATIVOS', 0)];
  rows.push(...sectionRows(cur.ingresosOperativos, prev?.ingresosOperativos, 1));
  rows.push(row('subtotal', 'Total ingresos operativos', 0, t.ingresosOperativos, pv('ingresosOperativos')));
  if (t.ingresosFinanciamiento || pv('ingresosFinanciamiento')) {
    rows.push(row('title', 'INGRESOS POR FINANCIAMIENTO (préstamos recibidos)', 0));
    rows.push(...sectionRows(cur.ingresosFinanciamiento, prev?.ingresosFinanciamiento, 1));
    rows.push(row('subtotal', 'Total ingresos por financiamiento', 0, t.ingresosFinanciamiento, pv('ingresosFinanciamiento')));
  }
  rows.push(row('total', 'TOTAL INGRESOS', 0, t.totalIngresos, pv('totalIngresos')));
  rows.push(row('title', 'GASTOS OPERATIVOS', 0));
  rows.push(...sectionRows(cur.gastosOperativos, prev?.gastosOperativos, 1));
  rows.push(row('subtotal', 'Total gastos operativos', 0, t.gastosOperativos, pv('gastosOperativos')));
  rows.push(row('memo', 'de los cuales fijos', 1, t.gastosFijos, pv('gastosFijos')));
  rows.push(row('memo', 'de los cuales variables', 1, t.gastosVariables, pv('gastosVariables')));
  rows.push(row('total', 'RESULTADO OPERATIVO (sin préstamos)', 0, t.resultadoOperativo, pv('resultadoOperativo')));
  rows.push(row('total', 'RESULTADO DEL PERÍODO', 0, t.resultado, pv('resultado')));
  if (cur.ratios.tasaAhorro !== null) rows.push(row('memo', 'Tasa de ahorro (resultado operativo / ingresos operativos, %)', 1, cur.ratios.tasaAhorro, prev?.ratios.tasaAhorro ?? null));
  rows.push(row('title', 'INFORMATIVO — no son gasto ni ingreso operativo', 0));
  rows.push(row('memo', 'Pagos a capital de deudas', 1, cur.memo.capitalDeuda, prev ? prev.memo.capitalDeuda : null));
  rows.push(row('memo', 'Ahorro e inversión', 1, cur.memo.ahorroInversion, prev ? prev.memo.ahorroInversion : null));
  rows.push(row('memo', 'Ventas de activos', 1, cur.memo.ventaActivos, prev ? prev.memo.ventaActivos : null));
  return rows;
}

// Las salidas de efectivo se muestran en negativo (ordenadas por su tamaño real).
const negateRows = (rows) => rows.map((r) => ({
  ...r,
  amount: r.amount === null ? null : -r.amount,
  previous: r.previous === null ? null : -r.previous,
  delta: r.delta === null ? null : -r.delta,
  pct: r.pct === null ? null : -r.pct,
}));

export function cashFlowRows(cur, prev = null) {
  const pv = (get) => (prev ? get(prev) : null);
  const rows = [row('total', 'Saldo inicial de efectivo', 0, cur.opening, pv((s) => s.opening))];
  const activity = (title, key, inLabel, outLabel, extra) => {
    rows.push(row('title', title, 0));
    rows.push(row('subtotal', inLabel, 0, cur[key].entradas.total, pv((s) => s[key].entradas.total)));
    rows.push(...sectionRows(cur[key].entradas, prev?.[key].entradas, 1));
    rows.push(row('subtotal', outLabel, 0, -cur[key].salidas.total, pv((s) => -s[key].salidas.total)));
    rows.push(...negateRows(sectionRows(cur[key].salidas, prev?.[key].salidas, 1)));
    if (extra) rows.push(...extra);
    rows.push(row('total', `Flujo neto de ${title.toLowerCase().replace('actividades de ', '')}`, 0, cur[key].neto, pv((s) => s[key].neto)));
  };
  activity('ACTIVIDADES DE OPERACIÓN', 'operacion', 'Cobros de ingresos operativos', 'Pagos de gastos operativos');
  activity('ACTIVIDADES DE INVERSIÓN', 'inversion', 'Entradas por inversión', 'Salidas por inversión',
    [row('line', 'Aportes netos a objetivos de ahorro', 1, cur.inversion.aportesObjetivos, pv((s) => s.inversion.aportesObjetivos))]);
  activity('ACTIVIDADES DE FINANCIACIÓN', 'financiacion', 'Préstamos recibidos y otras entradas', 'Pagos de deuda (capital) y otras salidas');
  rows.push(row('title', 'OTROS MOVIMIENTOS', 0));
  rows.push(row('line', 'Saldos iniciales de cuentas nuevas', 1, cur.otros.aperturas, pv((s) => s.otros.aperturas)));
  rows.push(row('line', 'Transferencias con cuentas fuera de este ámbito', 1, cur.otros.traspasos, pv((s) => s.otros.traspasos)));
  rows.push(row('total', 'FLUJO NETO DEL PERÍODO', 0, cur.flujoNeto, pv((s) => s.flujoNeto)));
  rows.push(row('total', 'Saldo final de efectivo', 0, cur.closing, pv((s) => s.closing)));
  return rows;
}

/* ------------------------------- exportación ------------------------------- */
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvNumber = (n) => (n === null || n === undefined ? '' : Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));

// CSV para Excel en español: separador ";" y coma decimal.
export function rowsToCsv(rows, { title, subtitle, comparative, previousLabel }) {
  const lines = [csvCell(title), csvCell(subtitle), ''];
  lines.push(['Concepto', 'Período', ...(comparative ? [previousLabel || 'Período anterior', 'Variación', 'Variación %'] : [])].map(csvCell).join(';'));
  rows.forEach((r) => {
    const label = `${'  '.repeat(r.level)}${r.label}`;
    const cells = [label, r.kind === 'title' ? '' : csvNumber(r.amount)];
    if (comparative) cells.push(csvNumber(r.previous), csvNumber(r.delta), csvNumber(r.pct));
    lines.push(cells.map(csvCell).join(';'));
  });
  return lines.join('\r\n');
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Documento HTML autónomo y listo para imprimir / guardar como PDF.
export function statementToHtml(rows, { title, subtitle, notes = [], comparative, previousLabel, formatMoney }) {
  const money = (n) => (n === null || n === undefined ? '' : escapeHtml(formatMoney(n)));
  const head = `<tr><th style="text-align:left">Concepto</th><th>Período</th>${comparative ? `<th>${escapeHtml(previousLabel || 'Anterior')}</th><th>Variación</th><th>Var. %</th>` : ''}</tr>`;
  const body = rows.map((r) => {
    const strong = r.kind === 'total' || r.kind === 'subtotal' || r.kind === 'title' || r.kind === 'group';
    const style = `${strong ? 'font-weight:700;' : ''}${r.kind === 'total' ? 'border-top:1px solid #333;' : ''}${r.kind === 'title' ? 'background:#f1f1ec;' : ''}${r.kind === 'memo' ? 'color:#666;' : ''}`;
    const cells = r.kind === 'title' ? '<td></td>'.repeat(comparative ? 4 : 1)
      : `<td class="n">${money(r.amount)}</td>${comparative ? `<td class="n">${money(r.previous)}</td><td class="n">${money(r.delta)}</td><td class="n">${r.pct === null ? '' : `${escapeHtml(r.pct)}%`}</td>` : ''}`;
    return `<tr style="${style}"><td style="padding-left:${8 + r.level * 16}px">${escapeHtml(r.label)}</td>${cells}</tr>`;
  }).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#1b2b3a;margin:28px}h1{font-size:20px;margin:0}p.s{color:#555;margin:4px 0 16px}
table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{padding:5px 8px}th{border-bottom:2px solid #333;text-align:right}td.n{text-align:right;font-variant-numeric:tabular-nums}
.notes{margin-top:18px;font-size:11px;color:#666}@media print{body{margin:12mm}}</style></head><body>
<h1>${escapeHtml(title)}</h1><p class="s">${escapeHtml(subtitle)}</p><table>${head}${body}</table>
<div class="notes">${notes.map((n) => `<p>${escapeHtml(n)}</p>`).join('')}</div></body></html>`;
}
