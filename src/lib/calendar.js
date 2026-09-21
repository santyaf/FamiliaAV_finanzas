// Calendario financiero — junta en un mes lo que entra y lo que sale: recurrentes, obligaciones, cuotas
// de crédito, cortes y pagos de tarjeta, metas y vencimientos de inversiones. Lógica pura.
import { assetKindLabel } from './assets';

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12
const parse = (iso) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) });
const inMonth = (iso, monthKey) => !!iso && iso.slice(0, 7) === monthKey;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function monthGrid(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const days = lastDay(y, m);
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  return { year: y, month: m, days, firstWeekday, weeks: Math.ceil((firstWeekday + days) / 7) };
}
export function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

// Fechas de un mes en las que cae algo que empezó en `startISO` y se repite con esa frecuencia.
export function datesInMonth(startISO, frequency, monthKey) {
  if (!startISO) return [];
  const [y, m] = monthKey.split('-').map(Number);
  const start = parse(startISO);
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${pad(lastDay(y, m))}`;
  if (frequency === 'semanal' || frequency === 'quincenal') {
    const step = frequency === 'semanal' ? 7 : 14;
    const out = [];
    const t0 = Date.UTC(start.y, start.m - 1, start.d);
    for (let t = t0; ; t += step * 86400000) {
      const iso = new Date(t).toISOString().slice(0, 10);
      if (iso > monthEnd) break;
      if (iso >= monthStart) out.push(iso);
    }
    return out;
  }
  if (frequency === 'anual') {
    if (start.m !== m || y < start.y) return [];
    return [`${y}-${pad(m)}-${pad(Math.min(start.d, lastDay(y, m)))}`];
  }
  // mensual
  if (`${y}-${pad(m)}` < startISO.slice(0, 7)) return [];
  return [`${y}-${pad(m)}-${pad(Math.min(start.d, lastDay(y, m)))}`];
}

const dayOfMonth = (monthKey, day) => {
  const [y, m] = monthKey.split('-').map(Number);
  return `${monthKey}-${pad(Math.min(day, lastDay(y, m)))}`;
};

export const EVENT_KINDS = {
  recurrente: 'Recurrente', obligacion: 'Obligación', cuota: 'Cuota de crédito', tarjeta_corte: 'Corte de tarjeta',
  tarjeta_pago: 'Pago de tarjeta', objetivo: 'Meta', vencimiento: 'Vencimiento de inversión',
};

export function buildCalendar({ monthKey, transactions = [], obligations = [], creditsWithPayments = [], accounts = [], goals = [], assets = [], categories = [] }) {
  const events = [];
  const catName = (id) => categories.find((c) => c.id === id)?.name;

  transactions.filter((t) => t.recurring && (t.type === 'income' || t.type === 'expense')).forEach((t) => {
    datesInMonth(t.date, t.frequency || 'mensual', monthKey).forEach((date) => {
      events.push({ id: `rec-${t.id}-${date}`, date, kind: 'recurrente', label: t.description || catName(t.categoryId) || 'Movimiento recurrente', amount: t.amount, flow: t.type === 'income' ? 'in' : 'out', status: null });
    });
  });

  obligations.filter((o) => o.enabled !== false).forEach((o) => {
    datesInMonth(o.nextDueDate, o.frequency || 'mensual', monthKey).forEach((date) => {
      events.push({ id: `obl-${o.id}-${date}`, date, kind: 'obligacion', label: o.name, amount: o.amount ?? null, flow: 'out', status: null });
    });
  });

  creditsWithPayments.forEach(({ credit, payments }) => {
    (payments || []).filter((p) => inMonth(p.dueDate, monthKey)).forEach((p) => {
      events.push({ id: `cred-${credit.id}-${p.installmentNumber}`, date: p.dueDate, kind: 'cuota', label: `${credit.name} · cuota ${p.installmentNumber}`, amount: p.total, flow: 'out', status: p.paid ? 'pagado' : 'pendiente', currency: credit.currency });
    });
  });

  accounts.filter((a) => a.paymentKind === 'tarjeta_credito').forEach((a) => {
    if (a.statementDay) events.push({ id: `corte-${a.id}`, date: dayOfMonth(monthKey, a.statementDay), kind: 'tarjeta_corte', label: `Corte ${a.name}`, amount: null, flow: null, status: null });
    if (a.paymentDay) events.push({ id: `pago-${a.id}`, date: dayOfMonth(monthKey, a.paymentDay), kind: 'tarjeta_pago', label: `Pagar ${a.name}`, amount: null, flow: 'out', status: null });
  });

  goals.filter((g) => inMonth(g.targetDate, monthKey)).forEach((g) => {
    events.push({ id: `goal-${g.id}`, date: g.targetDate, kind: 'objetivo', label: `Meta: ${g.name}`, amount: Math.max(0, g.targetAmount - g.currentAmount), flow: null, status: g.currentAmount >= g.targetAmount ? 'pagado' : 'pendiente' });
  });

  assets.filter((a) => a.status !== 'vendido' && inMonth(a.maturityDate, monthKey)).forEach((a) => {
    events.push({ id: `venc-${a.id}`, date: a.maturityDate, kind: 'vencimiento', label: `Vence ${a.name} (${assetKindLabel(a.kind).split(' (')[0]})`, amount: null, flow: 'in', status: null });
  });

  events.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'es'));
  const byDate = {};
  events.forEach((e) => { (byDate[e.date] ||= []).push(e); });
  const sum = (flow) => round2(events.filter((e) => e.flow === flow && e.amount && e.status !== 'pagado' && e.currency !== 'UVR').reduce((s, e) => s + e.amount, 0));
  return { events, byDate, totals: { in: sum('in'), out: sum('out') } };
}
