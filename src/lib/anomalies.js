// Detección de anomalías (Fase 13): cosas de los movimientos que vale la pena
// mirar dos veces. Lógica pura — sin React ni red — para poder probarla.
//
// Reglas (todas sobre GASTOS; los recurrentes "plantilla" no cuentan como
// eventos porque son un calendario, no una compra):
//   duplicate         mismo monto + misma descripción + mismo integrante en ≤1 día
//   unusual_amount    un gasto muy por encima de lo normal en su categoría
//   price_increase    un cobro mensual estable que subió de precio
//   category_spike    este mes ya va muy por encima del promedio de la categoría
//   many_subscriptions 4+ cobros que se repiten cada mes en la misma categoría
//
// Cada anomalía trae una `key` estable para poder descartarla (y que no
// vuelva a aparecer), y `data` estructurada; el texto en español sale de
// describeAnomaly() con el formateador de dinero/fecha inyectado.
import { todayISO, occurrencesInMonth } from './finance';

const DAY_MS = 86400000;
export const RECENT_DAYS = 30;          // anomalías de un movimiento: solo los últimos 30 días
const PRICE_RECENT_DAYS = 45;           // un cobro mensual "reciente" puede tener hasta 45 días
const BASELINE_DAYS = 180;              // historia contra la que se compara un gasto
const MIN_BASELINE = 5;                 // mínimo de gastos previos en la categoría para opinar
const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const daysBetween = (fromISO, toISO) => Math.round((toDate(toISO) - toDate(fromISO)) / DAY_MS);

export function normalizeText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

// un "evento" = un gasto real ocurrido en una fecha (no una plantilla recurrente)
const isEvent = (t) => t.type === 'expense' && !t.recurring && t.amount > 0 && !!t.date;
const byDateThenId = (a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id));

function previousMonthKeys(today, n) {
  const [y, m] = today.split('-').map(Number);
  const keys = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/* ---------------------------- 1. duplicados ---------------------------- */
function detectDuplicates(events, today) {
  const out = [];
  const lastSeen = new Map(); // firma → último movimiento con esa firma
  [...events].sort(byDateThenId).forEach((t) => {
    const desc = normalizeText(t.description);
    if (!desc) return; // sin descripción no hay forma de saber que es el mismo cobro
    const sig = `${t.memberId}|${t.amount}|${desc}`;
    const prev = lastSeen.get(sig);
    lastSeen.set(sig, t);
    if (!prev || daysBetween(prev.date, t.date) > 1) return;
    const age = daysBetween(t.date, today);
    if (age < 0 || age > RECENT_DAYS) return;
    out.push({
      key: `dup:${t.id}`, type: 'duplicate', date: t.date, txIds: [t.id, prev.id],
      severity: prev.date === t.date && prev.accountId === t.accountId ? 'high' : 'medium',
      data: { description: t.description, amount: t.amount, date: t.date, previousDate: prev.date },
    });
  });
  return out;
}

/* ------------------------- 2. monto inusual ------------------------- */
function detectUnusualAmounts(events, today) {
  const out = [];
  events.forEach((t) => {
    const age = daysBetween(t.date, today);
    if (age < 0 || age > RECENT_DAYS || !t.categoryId) return;
    const baseline = events.filter((o) => o.id !== t.id && o.categoryId === t.categoryId
      && daysBetween(o.date, t.date) >= 0 && daysBetween(o.date, t.date) <= BASELINE_DAYS);
    if (baseline.length < MIN_BASELINE) return;
    const amounts = baseline.map((o) => o.amount);
    const med = median(amounts);
    const mad = median(amounts.map((a) => Math.abs(a - med)));
    const outlier = mad > 0
      ? 0.6745 * (t.amount - med) / mad > 3.5 && t.amount > med * 2
      : t.amount > med * 3;
    if (!outlier) return;
    out.push({
      key: `unusual:${t.id}`, type: 'unusual_amount', date: t.date, txIds: [t.id],
      severity: t.amount >= med * 5 ? 'high' : 'medium',
      data: { amount: t.amount, median: med, categoryId: t.categoryId, description: t.description },
    });
  });
  return out;
}

/* ------------------- cobros mensuales (series) — reglas 3 y 5 ------------------- */
// Una "serie" es la misma descripción repetida ~cada mes: al menos 3 veces,
// con 20–40 días entre una y otra.
function monthlySeries(events) {
  const groups = new Map();
  events.forEach((t) => {
    const desc = normalizeText(t.description);
    if (!desc) return;
    const key = `${desc}|${t.categoryId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  const series = [];
  groups.forEach((list, key) => {
    const sorted = [...list].sort(byDateThenId);
    if (sorted.length < 3) return;
    const lastThree = sorted.slice(-3);
    const gaps = [daysBetween(lastThree[0].date, lastThree[1].date), daysBetween(lastThree[1].date, lastThree[2].date)];
    if (gaps.some((g) => g < 20 || g > 40)) return;
    series.push({ key, desc: key.split('|')[0], categoryId: lastThree[2].categoryId, last: lastThree[2], prev: lastThree[1], first: lastThree[0] });
  });
  return series;
}

/* -------------------------- 3. subida de precio -------------------------- */
function detectPriceIncreases(events, today) {
  const out = [];
  monthlySeries(events).forEach(({ first, prev, last }) => {
    const age = daysBetween(last.date, today);
    if (age < 0 || age > PRICE_RECENT_DAYS) return;
    const stable = Math.abs(prev.amount - first.amount) / first.amount <= 0.03;
    const rose = last.amount > prev.amount * 1.05 && last.amount <= prev.amount * 2;
    if (!stable || !rose) return;
    const pct = Math.round((last.amount / prev.amount - 1) * 100);
    out.push({
      key: `price:${last.id}`, type: 'price_increase', date: last.date, txIds: [last.id, prev.id],
      severity: pct >= 10 ? 'medium' : 'low',
      data: { description: last.description, previousAmount: prev.amount, newAmount: last.amount, pct },
    });
  });
  return out;
}

/* ---------------------- 4. categoría disparada este mes ---------------------- */
function detectCategorySpikes(transactions, today) {
  const mKey = today.slice(0, 7);
  const prevKeys = previousMonthKeys(today, 3);
  const totals = {}; // mes → categoría → gasto
  [mKey, ...prevKeys].forEach((k) => { totals[k] = {}; });
  transactions.forEach((t) => {
    if (t.type !== 'expense' || !t.categoryId) return;
    Object.keys(totals).forEach((k) => {
      const occ = occurrencesInMonth(t, k);
      if (occ) totals[k][t.categoryId] = (totals[k][t.categoryId] || 0) + t.amount * occ;
    });
  });
  const monthTotals = prevKeys.map((k) => Object.values(totals[k]).reduce((a, b) => a + b, 0)).filter((v) => v > 0);
  if (monthTotals.length < 2) return [];
  const avgMonthTotal = mean(monthTotals);

  const out = [];
  Object.entries(totals[mKey]).forEach(([categoryId, current]) => {
    const prevValues = prevKeys.map((k) => totals[k][categoryId] || 0).filter((v) => v > 0);
    if (prevValues.length < 2) return;
    const avg = mean(prevValues);
    if (current > avg * 1.5 && current - avg >= avgMonthTotal * 0.05) {
      out.push({
        key: `spike:${categoryId}:${mKey}`, type: 'category_spike', date: today, txIds: [],
        severity: current > avg * 2.5 ? 'high' : 'medium',
        data: { categoryId, current, average: avg },
      });
    }
  });
  return out;
}

/* ---------------------- 5. muchos cobros periódicos ---------------------- */
function detectManySubscriptions(transactions, events, today) {
  const seen = new Map(); // descripción normalizada → serie (para no contar dos veces la misma)
  monthlySeries(events).forEach((s) => {
    if (daysBetween(s.last.date, today) <= 60) seen.set(s.desc, { categoryId: s.categoryId, amount: s.last.amount });
  });
  transactions.forEach((t) => {
    if (t.type !== 'expense' || !t.recurring || t.frequency !== 'mensual' || !t.categoryId) return;
    const desc = normalizeText(t.description) || `#${t.id}`;
    if (!seen.has(desc)) seen.set(desc, { categoryId: t.categoryId, amount: t.amount });
  });
  const byCategory = new Map();
  seen.forEach(({ categoryId, amount }) => {
    const cur = byCategory.get(categoryId) || { count: 0, total: 0 };
    byCategory.set(categoryId, { count: cur.count + 1, total: cur.total + amount });
  });
  const out = [];
  byCategory.forEach(({ count, total }, categoryId) => {
    if (count < 4) return;
    out.push({
      key: `subs:${categoryId}:${count}`, type: 'many_subscriptions', date: today, txIds: [],
      severity: 'low', data: { categoryId, count, monthlyTotal: total },
    });
  });
  return out;
}

export function detectAnomalies(transactions, { today = todayISO() } = {}) {
  const events = transactions.filter(isEvent);
  return [
    ...detectDuplicates(events, today),
    ...detectUnusualAmounts(events, today),
    ...detectPriceIncreases(events, today),
    ...detectCategorySpikes(transactions, today),
    ...detectManySubscriptions(transactions, events, today),
  ].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.date.localeCompare(a.date));
}

// Texto en español para mostrar una anomalía. El formateo de dinero/fecha y el
// nombre de la categoría se inyectan (esta capa no conoce moneda ni categorías).
export function describeAnomaly(a, { formatMoney, formatDate, categoryName }) {
  const d = a.data;
  const cat = d.categoryId ? categoryName(d.categoryId) : '';
  switch (a.type) {
    case 'duplicate':
      return {
        title: 'Posible movimiento duplicado',
        detail: `"${d.description}" por ${formatMoney(d.amount)} aparece dos veces${d.previousDate === d.date ? ` el ${formatDate(d.date)}` : ` (${formatDate(d.previousDate)} y ${formatDate(d.date)})`}.`,
      };
    case 'unusual_amount':
      return {
        title: 'Gasto inusual',
        detail: `${formatMoney(d.amount)}${d.description ? ` en "${d.description}"` : ''} (${cat}) — lo normal en esa categoría ronda ${formatMoney(d.median)}.`,
      };
    case 'price_increase':
      return {
        title: 'Un cobro mensual subió de precio',
        detail: `"${d.description}" pasó de ${formatMoney(d.previousAmount)} a ${formatMoney(d.newAmount)} (+${d.pct}%).`,
      };
    case 'category_spike':
      return {
        title: `Gasto alto en ${cat} este mes`,
        detail: `Llevas ${formatMoney(d.current)}; en los meses anteriores el promedio fue ${formatMoney(d.average)}.`,
      };
    case 'many_subscriptions':
      return {
        title: `${d.count} cobros que se repiten cada mes en ${cat}`,
        detail: `Suman ${formatMoney(d.monthlyTotal)} al mes. ¿Todos siguen siendo necesarios?`,
      };
    default:
      return { title: 'Para revisar', detail: '' };
  }
}
