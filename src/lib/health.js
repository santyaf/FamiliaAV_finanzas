// Tasa de ahorro y puntaje de salud financiera — lógica pura, sin red ni React.
// Cuatro indicadores sobre los últimos meses COMPLETOS (solo ingresos y gastos operativos):
//   Tasa de ahorro        (ingresos - gastos) / ingresos            ≥ 20 % = puntaje pleno
//   Fondo de emergencia   efectivo disponible / gasto mensual       ≥ 6 meses = puntaje pleno
//   Carga de deuda        cuotas del mes / ingreso mensual          ≤ 15 % = puntaje pleno, ≥ 35 % = 0
//   Presupuestos          % de presupuestos que no se han pasado este mes
import { occurrencesInMonth } from './finance';
import { effectiveNature } from './accounting';
import { accountDelta } from './statements';

const round1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export const WEIGHTS = { ahorro: 0.35, emergencia: 0.3, deuda: 0.25, presupuestos: 0.1 };
export const LEVELS = [
  { min: 80, label: 'Excelente' }, { min: 60, label: 'Buena' }, { min: 40, label: 'Regular' }, { min: 0, label: 'Por mejorar' },
];
export const levelFor = (score) => LEVELS.find((l) => score >= l.min).label;

// Claves 'AAAA-MM' de los `count` meses completos anteriores al de `todayISO`.
export function previousMonthKeys(todayISO, count) {
  const y = Number(todayISO.slice(0, 4)); const m = Number(todayISO.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - (count - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function monthTotals(transactions, categoryById, mKey) {
  let income = 0; let expense = 0;
  transactions.forEach((t) => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    if (effectiveNature(t, categoryById.get(t.categoryId)) !== 'operativo') return;
    if (t.type === 'income') income += t.amount * occ; else expense += t.amount * occ;
  });
  return { income, expense };
}

export function computeHealth({ transactions, categories, accounts, budgets = [], creditsWithPayments = [], todayISO, monthsBack = 3 }) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const keys = previousMonthKeys(todayISO, monthsBack);
  const perMonth = keys.map((k) => ({ key: k, ...monthTotals(transactions, categoryById, k) })).filter((m) => m.income > 0 || m.expense > 0);
  const months = perMonth.length;
  if (!months || !perMonth.some((m) => m.income > 0)) return { score: null, level: null, months, components: [], tip: null, reason: 'Registra los ingresos y gastos de al menos un mes completo para calcular tu salud financiera.' };

  const income = perMonth.reduce((s, m) => s + m.income, 0) / months;
  const expense = perMonth.reduce((s, m) => s + m.expense, 0) / months;
  const components = [];

  // 1. tasa de ahorro
  const rate = income > 0 ? (income - expense) / income : 0;
  components.push({ id: 'ahorro', label: 'Tasa de ahorro', value: round1(rate * 100), unit: '%', score: round1(clamp((rate / 0.2) * 100)), weight: WEIGHTS.ahorro,
    detail: `Ahorras el ${round1(rate * 100)} % de tus ingresos (meta: 20 % o más).`, tip: 'Apunta a ahorrar al menos el 20 % de lo que ingresa: revisa primero los gastos variables más grandes.' });

  // 2. fondo de emergencia: efectivo disponible (sin tarjetas) / gasto mensual
  const cash = accounts.filter((a) => a.paymentKind !== 'tarjeta_credito')
    .reduce((s, a) => s + Math.max(0, transactions.reduce((x, t) => x + accountDelta(t, a.id), 0)), 0);
  if (expense > 0) {
    const coverage = cash / expense;
    components.push({ id: 'emergencia', label: 'Fondo de emergencia', value: round1(coverage), unit: 'meses', score: round1(clamp((coverage / 6) * 100)), weight: WEIGHTS.emergencia,
      detail: `Tu efectivo cubre ${round1(coverage)} meses de gastos (meta: 6 meses).`, tip: 'Arma un colchón de 3 a 6 meses de gastos en una cuenta de ahorros aparte.' });
  }

  // 3. carga de deuda: cuotas del próximo mes / ingreso mensual
  const installments = creditsWithPayments
    .filter(({ credit }) => credit.status !== 'pagado')
    .reduce((s, { payments }) => {
      const next = [...(payments || [])].filter((p) => !p.paid).sort((a, b) => a.installmentNumber - b.installmentNumber)[0];
      return s + (next ? (next.total || 0) : 0);
    }, 0);
  const debtRatio = income > 0 ? installments / income : 0;
  components.push({ id: 'deuda', label: 'Carga de deuda', value: round1(debtRatio * 100), unit: '%', score: round1(clamp(((0.35 - debtRatio) / 0.2) * 100)), weight: WEIGHTS.deuda,
    detail: installments > 0 ? `Tus cuotas de crédito suman el ${round1(debtRatio * 100)} % de tus ingresos (ideal: menos del 15 %; por encima de 35 % es riesgoso).` : 'No tienes cuotas de crédito pendientes.',
    tip: 'Prioriza pagar los créditos más caros y evita tomar deuda nueva hasta bajar de 35 % de tus ingresos.' });

  // 4. presupuestos del mes en curso que no se han pasado
  const mKey = todayISO.slice(0, 7);
  if (budgets.length) {
    const ok = budgets.filter((b) => {
      const spent = transactions.filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && (b.scope === 'household' || t.memberId === b.scope))
        .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mKey), 0);
      return spent <= b.limit;
    }).length;
    const pct = (ok / budgets.length) * 100;
    components.push({ id: 'presupuestos', label: 'Presupuestos', value: round1(pct), unit: '%', score: round1(pct), weight: WEIGHTS.presupuestos,
      detail: `${ok} de ${budgets.length} presupuestos vienen dentro de su límite este mes.`, tip: 'Ajusta el límite de los presupuestos que siempre te pasas, o recorta ese gasto.' });
  }

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);
  const weakest = [...components].sort((a, b) => a.score - b.score)[0];
  return {
    score, level: levelFor(score), months, components: components.map((c) => ({ ...c, score: round1(c.score) })),
    tip: weakest.score < 70 ? weakest.tip : 'Vas muy bien: mantén el hábito y revisa tu puntaje cada mes.', weakest: weakest.id,
    averages: { income: round2(income), expense: round2(expense), savingsRate: round1(rate * 100) },
  };
}
