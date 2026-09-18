// Tarjetas de crédito (Fase 19) — lógica pura, sin red ni React.
//
// Modelo contable:
//  - Una compra con tarjeta es un GASTO en la cuenta de la tarjeta por el valor
//    completo el día de la compra (el cupo también se consume completo).
//  - Si se difiere a N cuotas, se crea un "plan": cada corte se factura una cuota;
//    el interés de esa cuota es un gasto nuevo (Intereses y comisiones) en la tarjeta.
//    El capital NO es un gasto otra vez: ya se registró con la compra.
//  - Pagar la tarjeta es una TRANSFERENCIA de una cuenta a la tarjeta (no es gasto).
//  - Deuda de la tarjeta = -saldo de la cuenta. Disponible = cupo - deuda.
import { generateSchedule } from './amortization';
import { nextDateWithDay } from './creditRules';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Cupo, deuda y disponible de una tarjeta a partir del saldo de su cuenta.
export function cardUsage(account, balance) {
  const limit = Number(account.creditLimit) || 0;
  const used = Math.max(0, round2(-balance));
  const credit = balance > 0 ? round2(balance) : 0; // saldo a favor (pagó de más)
  const available = limit > 0 ? round2(limit - used) : null;
  return { limit, used, credit, available, utilization: limit > 0 ? used / limit : null };
}

// Fechas del ciclo: último corte, próximo corte y fecha límite de pago del corte
// más reciente. `statementDay` y `paymentDay` son días del mes (1-31).
export function cardCycle(account, todayISO) {
  const s = Number(account.statementDay) || 0;
  const p = Number(account.paymentDay) || 0;
  if (!s) return { lastStatement: null, nextStatement: null, paymentDue: null };
  const nextStatement = nextDateWithDay(todayISO, s);
  const [y, m] = nextStatement.split('-').map(Number);
  const lastStatement = dayInMonth(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1, s);
  let paymentDue = null;
  if (p) {
    // el pago vence el primer día `p` posterior al corte más reciente; si ya pasó,
    // el que viene es el del próximo corte
    paymentDue = nextDateWithDay(addDays(lastStatement, 1), p);
    if (paymentDue < todayISO) paymentDue = nextDateWithDay(addDays(nextStatement, 1), p);
  }
  return { lastStatement, nextStatement, paymentDue };
}

// Día `day` del mes (m: 1-12); si el mes no lo tiene, su último día.
function dayInMonth(y, m, day) {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Fecha en la que se factura la primera cuota de una compra: el corte que la incluye.
export function firstBillDate(purchaseISO, statementDay) {
  return nextDateWithDay(purchaseISO, statementDay || Number(purchaseISO.slice(8, 10)));
}

// Calendario del plan (cuota francesa: capital + interés; sin seguro).
export function planSchedule(plan) {
  if (!(plan.principal > 0) || !(plan.installments > 0)) return [];
  return generateSchedule({
    principal: plan.principal, annualRate: plan.annualRate || 0, termMonths: plan.installments,
    system: 'frances', insuranceMonthly: 0, firstDueDate: plan.firstBillDate,
  });
}

// Capital que todavía está diferido (aún no facturado).
export function planOutstanding(plan, rows = planSchedule(plan)) {
  if (!rows.length) return 0;
  if (plan.billedCount <= 0) return round2(plan.principal);
  if (plan.billedCount >= rows.length) return 0;
  return round2(rows[plan.billedCount - 1].balanceAfter);
}

export function planNextInstallment(plan, rows = planSchedule(plan)) {
  return rows[plan.billedCount] || null;
}

// Cuotas del plan que ya toca facturar (su corte llegó) y aún no se han facturado.
export function duePlanInstallments(plan, todayISO) {
  if (plan.status !== 'activo') return [];
  return planSchedule(plan).slice(plan.billedCount).filter((r) => r.dueDate <= todayISO);
}

export function planOverview(plan) {
  const rows = planSchedule(plan);
  const remaining = rows.slice(plan.billedCount);
  return {
    outstanding: planOutstanding(plan, rows),
    billed: Math.min(plan.billedCount, rows.length),
    total: rows.length,
    next: remaining[0] || null,
    remainingInterest: round2(remaining.reduce((s, r) => s + r.interest, 0)),
    lastDueDate: rows.length ? rows[rows.length - 1].dueDate : null,
  };
}

// Rediferir un plan: el saldo diferido que queda (menos un abono opcional a capital)
// se vuelve a repartir en `installments` cuotas a `annualRate`. Las cuotas ya
// facturadas no cambian. Devuelve el plan nuevo y su comparación antes/después.
export function buildRedefer(plan, { annualRate, installments, extraPayment = 0 }) {
  const before = planOverview(plan);
  const balance = before.outstanding;
  const principal = round2(Math.max(0, balance - Math.max(0, extraPayment)));
  const firstBill = before.next ? before.next.dueDate : null;
  const next = { ...plan, principal, annualRate, installments, firstBillDate: firstBill, billedCount: 0, status: principal > 0 ? 'activo' : 'pagado' };
  const after = principal > 0 && firstBill ? planOverview(next) : { outstanding: 0, billed: 0, total: 0, next: null, remainingInterest: 0, lastDueDate: null };
  return { plan: next, balanceBefore: balance, balanceAfter: principal, before, after };
}

// Lo que ya se facturó y sigue sin pagar (aprox.): la deuda total menos lo que sigue
// diferido. Incluye compras de un solo pago hechas después del último corte.
export function payToAvoidInterest(used, plans) {
  const deferred = plans.reduce((s, p) => s + planOutstanding(p), 0);
  return { deferred: round2(deferred), payNow: round2(Math.max(0, used - deferred)) };
}

export const CARD_EVENT_LABELS = {
  creacion: 'Compra diferida', rediferido: 'Rediferido', abono: 'Abono a capital del diferido', cobro: 'Cuota facturada',
};
