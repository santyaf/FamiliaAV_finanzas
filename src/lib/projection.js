// Proyección a fin de mes y "disponible para gastar hoy" — lógica pura, sin red ni React.
import { occurrencesInMonth } from './finance';
import { effectiveNature } from './accounting';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Lo que queda de cada presupuesto del mes repartido entre los días que faltan
// (contando hoy). Si un presupuesto ya se pasó, resta del total: no se recorta a 0
// para que se note que hay que compensar en otro lado.
export function budgetAllowances({ transactions, budgets, mKey, daysLeft }) {
  const days = Math.max(1, daysLeft);
  const rows = budgets.map((b) => {
    const spent = transactions
      .filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && (b.scope === 'household' || t.memberId === b.scope))
      .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mKey), 0);
    const remaining = b.limit - spent;
    return { budgetId: b.id, categoryId: b.categoryId, limit: b.limit, spent: round2(spent), remaining: round2(remaining), perDay: round2(remaining / days) };
  });
  return {
    rows,
    totalRemaining: round2(rows.reduce((s, r) => s + r.remaining, 0)),
    totalPerDay: round2(rows.reduce((s, r) => s + r.perDay, 0)),
  };
}

// Proyección del mes en curso. Solo cuenta ingresos y gastos operativos (no préstamos,
// capital de deudas, inversión ni saldos iniciales).
//  - Gastos FIJOS (recurrentes, de categoría "fija" o con fecha futura): se toman tal cual.
//  - Gastos VARIABLES: se extrapola el ritmo diario de lo que va del mes.
// Es una estimación simple ("a este ritmo…"): un gasto grande de una sola vez la infla.
export function projectMonth({ transactions, categories, todayISO }) {
  const mKey = todayISO.slice(0, 7);
  const [y, m] = mKey.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Number(todayISO.slice(8, 10));
  const daysAfterToday = daysInMonth - day;
  const catById = new Map(categories.map((c) => [c.id, c]));

  let income = 0; let fixed = 0; let variable = 0;
  transactions.forEach((t) => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    const cat = catById.get(t.categoryId);
    if (effectiveNature(t, cat) !== 'operativo') return;
    const amount = t.amount * occ;
    if (t.type === 'income') { income += amount; return; }
    if (t.recurring || cat?.isFixed || t.date > todayISO) fixed += amount; else variable += amount;
  });

  const dailyAverage = variable / day;
  const projectedVariable = variable + dailyAverage * daysAfterToday;
  const projectedExpense = fixed + projectedVariable;
  const projectedBalance = income - projectedExpense;
  let status = 'ok';
  if (projectedBalance < 0) status = 'over';
  else if (income > 0 && projectedBalance < income * 0.1) status = 'tight';
  const confidence = day < 5 ? 'low' : day < 10 ? 'medium' : 'high';

  return {
    day, daysInMonth, daysAfterToday,
    incomeSoFar: round2(income), fixed: round2(fixed), variableSoFar: round2(variable),
    dailyAverage: round2(dailyAverage), projectedExpense: round2(projectedExpense),
    projectedBalance: round2(projectedBalance), status, confidence,
  };
}
