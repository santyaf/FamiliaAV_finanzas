// Estado de Situación Financiera (balance) y Cambios en el Patrimonio — lógica pura.
// Igual que en statements.js, el ámbito es PERSONAL (mis cuentas individuales, mis activos y mis
// créditos) o HOGAR (cuentas compartidas, activos y créditos del hogar).
//
//  Activos = efectivo y cuentas (saldos positivos) + ahorro en objetivos + activos (a su valor a la
//            fecha) + cuentas por cobrar.
//  Pasivos = tarjetas de crédito y sobregiros (saldos negativos de cuentas) + saldo de los créditos.
//  Patrimonio = activos - pasivos.
import { accountsInScope, accountDelta, buildCashFlow, row } from './statements';
import { assetValueAt, assetRevaluation, dayBefore, assetKindLabel, creditBalanceAt } from './assets';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const inScope = (ownerMemberId, scope) => (scope.kind === 'hogar' ? !ownerMemberId : ownerMemberId === scope.memberId);

function scopedAssets(assets, scope) {
  return (assets || []).filter((a) => inScope(a.ownerMemberId, scope));
}
function scopedCredits(creditsWithPayments, scope) {
  return (creditsWithPayments || []).filter(({ credit }) => inScope(credit.ownerMemberId, scope));
}

// Saldo de una cuenta a una fecha: lo REGISTRADO hasta ese día (mismas reglas que el flujo de efectivo).
export function balanceAt(transactions, accountId, dateISO) {
  return round2(transactions.reduce((s, t) => (t.date <= dateISO ? s + accountDelta(t, accountId) : s), 0));
}

export function buildBalanceSheet({ accounts, transactions, assets, creditsWithPayments, scope, dateISO, uvrValue }) {
  const scopeAccounts = accountsInScope(accounts, scope);
  const accountIds = new Set(scopeAccounts.map((a) => a.id));

  const cash = []; const cards = []; const overdrafts = [];
  scopeAccounts.forEach((a) => {
    const balance = balanceAt(transactions, a.id, dateISO);
    if (balance > 0) cash.push({ key: a.id, label: a.name, amount: balance });
    else if (balance === 0) return;
    else if (a.paymentKind === 'tarjeta_credito') cards.push({ key: a.id, label: a.name, amount: -balance });
    else overdrafts.push({ key: a.id, label: a.name, amount: -balance });
  });

  // ahorro apartado en objetivos: lo aportado menos lo retirado, desde las cuentas de este ámbito
  const goalsTotal = round2(transactions.reduce((s, t) => {
    if (t.type !== 'transfer' || !t.goalId || t.date > dateISO || !accountIds.has(t.accountId)) return s;
    return s + (t.transferDirection === 'withdraw' ? -t.amount : t.amount);
  }, 0));

  const kinds = {};
  scopedAssets(assets, scope).forEach((a) => {
    const { value, basis } = assetValueAt(a, a.valuations, dateISO);
    if (value <= 0) return;
    (kinds[a.kind] ||= []).push({ key: a.id, label: a.name, amount: value, basis });
  });
  const receivables = kinds.por_cobrar || [];
  const assetGroups = Object.entries(kinds).filter(([k]) => k !== 'por_cobrar').map(([kind, lines]) => ({ kind, label: assetKindLabel(kind), lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)) }));

  let uvrPending = false;
  const credits = [];
  scopedCredits(creditsWithPayments, scope).forEach(({ credit, payments }) => {
    let balance = creditBalanceAt(credit, payments, dateISO);
    if (balance <= 0) return;
    if (credit.currency === 'UVR') {
      if (!(uvrValue > 0)) { uvrPending = true; return; }
      balance = round2(balance * uvrValue);
    }
    credits.push({ key: credit.id, label: credit.name, amount: balance });
  });

  const sum = (lines) => round2(lines.reduce((s, l) => s + l.amount, 0));
  const totals = {
    cash: sum(cash), goals: goalsTotal, assets: round2(assetGroups.reduce((s, g) => s + g.total, 0)), receivables: sum(receivables),
    cards: sum(cards), overdrafts: sum(overdrafts), credits: sum(credits),
  };
  totals.totalAssets = round2(totals.cash + totals.goals + totals.assets + totals.receivables);
  totals.totalLiabilities = round2(totals.cards + totals.overdrafts + totals.credits);
  totals.equity = round2(totals.totalAssets - totals.totalLiabilities);

  return {
    dateISO, cash, goalsTotal, assetGroups, receivables, cards, overdrafts, credits, totals, uvrPending,
    ratios: {
      endeudamiento: totals.totalAssets > 0 ? round2((totals.totalLiabilities / totals.totalAssets) * 100) : null,
      liquidez: totals.totalLiabilities > 0 ? round2(totals.cash / totals.totalLiabilities) : null,
    },
  };
}

// Une las líneas de dos fechas por clave, para que el comparativo muestre también lo que solo existió en una.
function lineRows(cur, prev, level) {
  const keys = new Map();
  cur.forEach((l) => keys.set(l.key, l.label));
  (prev || []).forEach((l) => { if (!keys.has(l.key)) keys.set(l.key, l.label); });
  return [...keys.entries()]
    .map(([key, label]) => ({ label, amount: cur.find((l) => l.key === key)?.amount || 0, previous: (prev || []).find((l) => l.key === key)?.amount || 0 }))
    .sort((a, b) => b.amount - a.amount || b.previous - a.previous)
    .map((l) => row('line', l.label, level, l.amount, prev ? l.previous : null));
}

export function balanceSheetRows(cur, prev = null) {
  const t = cur.totals; const p = prev?.totals;
  const pv = (key) => (p ? p[key] : null);
  const rows = [row('title', 'ACTIVOS', 0)];
  const group = (label, curLines, prevLines, total, prevTotal) => {
    if (!curLines.length && !(prevLines || []).length) return;
    rows.push(row('group', label, 0, total, prevTotal));
    rows.push(...lineRows(curLines, prev ? (prevLines || []) : null, 1));
  };
  group('Efectivo y cuentas', cur.cash, prev?.cash, t.cash, pv('cash'));
  if (t.goals || pv('goals')) rows.push(row('group', 'Ahorro apartado en objetivos', 0, t.goals, pv('goals')));
  const kinds = new Set([...cur.assetGroups.map((g) => g.kind), ...(prev?.assetGroups || []).map((g) => g.kind)]);
  kinds.forEach((kind) => {
    const cg = cur.assetGroups.find((g) => g.kind === kind); const pg = prev?.assetGroups.find((g) => g.kind === kind);
    group(assetKindLabel(kind), cg?.lines || [], pg?.lines, cg?.total || 0, prev ? (pg?.total || 0) : null);
  });
  group('Cuentas por cobrar', cur.receivables, prev?.receivables, t.receivables, pv('receivables'));
  rows.push(row('total', 'TOTAL ACTIVOS', 0, t.totalAssets, pv('totalAssets')));

  rows.push(row('title', 'PASIVOS', 0));
  group('Tarjetas de crédito', cur.cards, prev?.cards, t.cards, pv('cards'));
  group('Sobregiros', cur.overdrafts, prev?.overdrafts, t.overdrafts, pv('overdrafts'));
  group('Créditos y préstamos', cur.credits, prev?.credits, t.credits, pv('credits'));
  rows.push(row('total', 'TOTAL PASIVOS', 0, t.totalLiabilities, pv('totalLiabilities')));
  rows.push(row('total', 'PATRIMONIO (activos − pasivos)', 0, t.equity, pv('equity')));
  if (cur.ratios.endeudamiento !== null) rows.push(row('memo', 'Endeudamiento (pasivos / activos, %)', 1, cur.ratios.endeudamiento, prev?.ratios.endeudamiento ?? null));
  if (cur.ratios.liquidez !== null) rows.push(row('memo', 'Liquidez (efectivo / pasivos, veces)', 1, cur.ratios.liquidez, prev?.ratios.liquidez ?? null));
  return rows;
}

// Cambios en el patrimonio de un período. Patrimonio inicial + resultado operativo + saldos iniciales +
// transferencias con cuentas de fuera del ámbito + valorización de activos + otros = patrimonio final.
// "Otros" es lo que queda sin explicar (el saldo de los créditos se calcula con su tabla de amortización,
// y los gastos compartidos se reparten distinto entre ámbitos): por eso siempre cuadra, y se muestra aparte.
export function buildEquityChanges({ accounts, transactions, categories, assets, creditsWithPayments, scope, range, uvrValue }) {
  const common = { accounts, transactions, assets, creditsWithPayments, scope, uvrValue };
  const openingSheet = buildBalanceSheet({ ...common, dateISO: dayBefore(range.start) });
  const closingSheet = buildBalanceSheet({ ...common, dateISO: range.end });
  const cashFlow = buildCashFlow({ transactions, categories, accounts, range, scope });

  const revaluationDetail = scopedAssets(assets, scope)
    .map((a) => ({ name: a.name, amount: assetRevaluation(a, a.valuations, range.start, range.end) }))
    .filter((d) => d.amount !== 0);
  const revaluation = round2(revaluationDetail.reduce((s, d) => s + d.amount, 0));

  const opening = openingSheet.totals.equity;
  const closing = closingSheet.totals.equity;
  const operating = cashFlow.operacion.neto;
  const apertura = cashFlow.otros.aperturas;
  const traspasos = cashFlow.otros.traspasos;
  const other = round2(closing - opening - operating - apertura - traspasos - revaluation);

  return { opening, operating, apertura, traspasos, revaluation, revaluationDetail, other, closing, openingSheet, closingSheet };
}

export function equityRows(cur, prev = null) {
  const pv = (key) => (prev ? prev[key] : null);
  const rows = [row('total', 'Patrimonio al inicio del período', 0, cur.opening, pv('opening'))];
  rows.push(row('line', 'Resultado operativo (ingresos − gastos operativos)', 1, cur.operating, pv('operating')));
  rows.push(row('line', 'Saldos iniciales de cuentas nuevas', 1, cur.apertura, pv('apertura')));
  rows.push(row('line', 'Transferencias con cuentas fuera de este ámbito (aportes y retiros)', 1, cur.traspasos, pv('traspasos')));
  rows.push(row('line', 'Valorización de activos y bienes recibidos', 1, cur.revaluation, pv('revaluation')));
  cur.revaluationDetail.forEach((d) => rows.push(row('memo', d.name, 2, d.amount, null)));
  rows.push(row('line', 'Otros movimientos y diferencias', 1, cur.other, pv('other')));
  rows.push(row('total', 'Patrimonio al final del período', 0, cur.closing, pv('closing')));
  rows.push(row('memo', 'Cambio del patrimonio en el período', 1, round2(cur.closing - cur.opening), prev ? round2(prev.closing - prev.opening) : null));
  return rows;
}
