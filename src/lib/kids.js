// Hijos y mesada: la alcancía de cada niño (libro de movimientos), la mesada programada y sus metas.
// Los niños no inician sesión: los adultos del hogar los administran. La alcancía es informativa; el gasto del hogar
// ocurre cuando se paga la mesada o una recompensa (un gasto normal en la cuenta del adulto).

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const ALLOWANCE_FREQUENCIES = [
  { id: 'semanal', label: 'Cada semana' },
  { id: 'quincenal', label: 'Cada 2 semanas' },
  { id: 'mensual', label: 'Cada mes' },
];

export const KID_CATEGORY = { name: 'Mesada e hijos', type: 'expense', icon: 'heart-pulse', group: 'Familia', nature: 'operativo', fixed: false };

// signo: entra (+) o sale (-) de la alcancía
export const LEDGER_KINDS = {
  mesada: { label: 'Mesada', sign: 1 },
  recompensa: { label: 'Recompensa por tarea', sign: 1 },
  regalo: { label: 'Regalo o dinero recibido', sign: 1 },
  gasto: { label: 'Gasto del niño', sign: -1 },
  compra_meta: { label: 'Compra de una meta', sign: -1 },
  ajuste: { label: 'Ajuste', sign: 1 },
};

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12

// Siguiente fecha de la mesada. Al mes no se le desborda el día (31 de enero → 28 de febrero, no 3 de marzo).
export function nextAllowanceDate(dateISO, frequency) {
  const [y, m, d] = dateISO.split('-').map(Number);
  if (frequency === 'semanal' || frequency === 'quincenal') {
    const dt = new Date(Date.UTC(y, m - 1, d + (frequency === 'semanal' ? 7 : 14)));
    return dt.toISOString().slice(0, 10);
  }
  const ny = m === 12 ? y + 1 : y; const nm = m === 12 ? 1 : m + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

export const hasAllowance = (kid) => !!(kid?.allowanceAmount > 0 && kid.allowanceFrequency && kid.allowanceNextDate);

// Fechas de mesada ya vencidas (hoy incluido), de la más antigua a la más reciente; tope para no pagar años atrasados.
export function dueAllowanceDates(kid, todayISO, max = 12) {
  if (!hasAllowance(kid) || kid.archived) return [];
  const dates = [];
  let d = kid.allowanceNextDate;
  while (d <= todayISO && dates.length < max) { dates.push(d); d = nextAllowanceDate(d, kid.allowanceFrequency); }
  return dates;
}

export const kidBalance = (entries) => round2((entries || []).reduce((s, e) => s + Number(e.amount || 0), 0));

export function goalProgress(goal, balance) {
  const pct = Math.max(0, Math.min(100, Math.floor((balance / goal.targetAmount) * 100)));
  return { pct, remaining: round2(Math.max(0, goal.targetAmount - balance)), reached: balance >= goal.targetAmount };
}

// Metas alcanzadas que todavía no se marcaron como compradas (para celebrar).
export const goalsToCelebrate = (goals, balance) => (goals || []).filter((g) => !g.achievedAt && balance >= g.targetAmount);

export function ageLabel(birthDate, todayISO) {
  if (!birthDate) return '';
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = todayISO.split('-').map(Number);
  let months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 0) return '';
  if (months < 24) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  return `${Math.floor(months / 12)} años`;
}

// Resumen de una alcancía: cuánto hay, cuánto ha entrado y salido, y la próxima mesada.
export function kidSummary(kid, entries, todayISO) {
  const list = entries || [];
  const inflow = round2(list.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0));
  const outflow = round2(-list.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0));
  return {
    balance: kidBalance(list), inflow, outflow,
    nextAllowance: hasAllowance(kid) && !kid.archived ? { date: kid.allowanceNextDate, amount: kid.allowanceAmount, frequency: kid.allowanceFrequency, overdue: kid.allowanceNextDate < todayISO } : null,
    age: ageLabel(kid.birthDate, todayISO),
  };
}

// Movimientos de la alcancía, del más reciente al más antiguo, con su saldo acumulado.
export function ledgerWithBalance(entries) {
  const asc = [...(entries || [])].sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt).localeCompare(String(b.createdAt)));
  let run = 0;
  return asc.map((e) => { run = round2(run + e.amount); return { ...e, balanceAfter: run }; }).reverse();
}

// Valida el monto de un movimiento manual: gasto no puede dejar la alcancía en negativo.
export function validateLedgerEntry({ kind, amount, balance }) {
  const value = Number(amount);
  if (!(value > 0)) return 'Escribe un monto mayor que cero.';
  const sign = LEDGER_KINDS[kind]?.sign;
  if (!sign) return 'Elige qué tipo de movimiento es.';
  if (sign < 0 && value > balance) return 'La alcancía no tiene tanto dinero.';
  return '';
}
