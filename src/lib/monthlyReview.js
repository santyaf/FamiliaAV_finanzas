// Reunión mensual del hogar — lógica pura. Resume un mes para revisarlo en familia: cuánto entró y salió,
// contra el mes anterior, en qué se fue la plata, presupuestos, metas y deudas, con logros y alertas.
import { occurrencesInMonth } from './finance';
import { effectiveNature } from './accounting';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

export function previousMonthKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function totalsFor(transactions, categoryById, monthKey) {
  let income = 0; let expense = 0;
  const byCategory = new Map();
  transactions.forEach((t) => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const occ = occurrencesInMonth(t, monthKey);
    if (!occ) return;
    const cat = categoryById.get(t.categoryId);
    if (effectiveNature(t, cat) !== 'operativo') return;
    const amount = t.amount * occ;
    if (t.type === 'income') { income += amount; return; }
    expense += amount;
    byCategory.set(t.categoryId, (byCategory.get(t.categoryId) || 0) + amount);
  });
  return { income: round2(income), expense: round2(expense), net: round2(income - expense), savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : null, byCategory };
}

export function buildMonthlyReview({ monthKey, transactions, categories, budgets = [], goals = [] }) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const cur = totalsFor(transactions, categoryById, monthKey);
  const prevKey = previousMonthKey(monthKey);
  const prev = totalsFor(transactions, categoryById, prevKey);

  const topCategories = [...cur.byCategory.entries()]
    .map(([id, amount]) => { const before = prev.byCategory.get(id) || 0; return { categoryId: id, name: categoryById.get(id)?.name || 'Sin categoría', amount: round2(amount), previous: round2(before), changePct: pct(amount, before), share: cur.expense > 0 ? Math.round((amount / cur.expense) * 100) : 0 }; })
    .sort((a, b) => b.amount - a.amount).slice(0, 6);

  const biggestExpenses = transactions
    .filter((t) => t.type === 'expense' && !t.recurring && t.date?.slice(0, 7) === monthKey && effectiveNature(t, categoryById.get(t.categoryId)) === 'operativo')
    .sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map((t) => ({ id: t.id, description: t.description || categoryById.get(t.categoryId)?.name || 'Gasto', amount: t.amount, date: t.date }));

  const budgetRows = budgets.map((b) => {
    const spent = transactions.filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && (b.scope === 'household' || t.memberId === b.scope))
      .reduce((s, t) => s + t.amount * occurrencesInMonth(t, monthKey), 0);
    const p = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
    return { budgetId: b.id, name: categoryById.get(b.categoryId)?.name || 'Sin categoría', limit: b.limit, spent: round2(spent), pct: p, status: p > 100 ? 'pasado' : p >= 85 ? 'justo' : 'ok' };
  }).sort((a, b) => b.pct - a.pct);

  const goalRows = goals.map((g) => {
    const contributed = transactions.filter((t) => t.type === 'transfer' && t.goalId === g.id && t.date?.slice(0, 7) === monthKey)
      .reduce((s, t) => s + (t.transferDirection === 'withdraw' ? -t.amount : t.amount), 0);
    return { goalId: g.id, name: g.name, progress: g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0, contributed: round2(contributed), remaining: Math.max(0, round2(g.targetAmount - g.currentAmount)) };
  });

  // deudas: lo pagado a capital (financiamiento) e intereses / seguro del mes
  const capitalPaid = round2(transactions.filter((t) => t.type === 'expense' && t.date?.slice(0, 7) === monthKey && effectiveNature(t, categoryById.get(t.categoryId)) === 'financiamiento').reduce((s, t) => s + t.amount, 0));
  const interestPaid = round2(transactions.filter((t) => t.type === 'expense' && t.date?.slice(0, 7) === monthKey && categoryById.get(t.categoryId)?.name === 'Intereses y comisiones').reduce((s, t) => s + t.amount, 0));

  const wins = []; const watch = [];
  if (cur.income > 0 && cur.savingsRate !== null) {
    if (cur.savingsRate >= 20) wins.push(`Ahorraron el ${cur.savingsRate} % de lo que ingresó: superaron la meta del 20 %.`);
    else if (cur.savingsRate < 0) watch.push(`Gastaron más de lo que ingresó (${cur.savingsRate} % de ahorro).`);
    else if (cur.savingsRate < 10) watch.push(`Solo ahorraron el ${cur.savingsRate} % de los ingresos; la meta sana es 20 %.`);
  }
  if (budgetRows.length && budgetRows.every((b) => b.status !== 'pasado')) wins.push('Ningún presupuesto se pasó de su límite.');
  budgetRows.filter((b) => b.status === 'pasado').forEach((b) => watch.push(`Se pasaron del presupuesto de ${b.name}: ${b.pct} % del límite.`));
  topCategories.filter((c) => c.changePct !== null && c.changePct >= 30 && c.amount - c.previous >= 50000).slice(0, 2)
    .forEach((c) => watch.push(`${c.name} subió ${c.changePct} % frente al mes anterior.`));
  if (prev.expense > 0 && cur.expense < prev.expense * 0.9) wins.push(`Gastaron ${Math.round(((prev.expense - cur.expense) / prev.expense) * 100)} % menos que el mes anterior.`);
  goalRows.filter((g) => g.contributed > 0).forEach((g) => wins.push(`Aportaron a la meta "${g.name}" (${g.progress} % completa).`));
  if (capitalPaid > 0) wins.push('Pagaron a capital de sus deudas.');

  return {
    monthKey, previousKey: prevKey,
    totals: { income: cur.income, expense: cur.expense, net: cur.net, savingsRate: cur.savingsRate },
    previous: { income: prev.income, expense: prev.expense, net: prev.net, savingsRate: prev.savingsRate },
    change: { income: pct(cur.income, prev.income), expense: pct(cur.expense, prev.expense) },
    topCategories, biggestExpenses, budgets: budgetRows, goals: goalRows, debt: { capitalPaid, interestPaid }, wins, watch,
    hasData: cur.income > 0 || cur.expense > 0,
  };
}

// Decisiones: [{ id, text, done }]
export const newDecision = (text) => ({ id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: text.trim(), done: false });
export const toggleDecision = (list, id) => list.map((d) => (d.id === id ? { ...d, done: !d.done } : d));
export const removeDecision = (list, id) => list.filter((d) => d.id !== id);
