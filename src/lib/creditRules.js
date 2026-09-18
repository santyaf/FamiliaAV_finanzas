// Reglas de negocio de los créditos (Fase 18) — lógica pura, sin red ni React.
// Complementa amortization.js (cálculo de cuotas) y finance.js (saldo).
import { addMonths } from './amortization';
import { splitInstallment } from './accounting';

const pad = (n) => String(n).padStart(2, '0');
const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12

// Primera fecha, desde `fromISO` (incluida), que cae en el día `day` del mes.
// Si el mes no tiene ese día (ej. 31 en febrero) usa el último día del mes.
export function nextDateWithDay(fromISO, day) {
  const [y, m] = fromISO.split('-').map(Number);
  const candidate = `${y}-${pad(m)}-${pad(Math.min(day, lastDayOfMonth(y, m)))}`;
  if (candidate >= fromISO) return candidate;
  const next = addMonths(`${y}-${pad(m)}-01`, 1);
  const [ny, nm] = next.split('-').map(Number);
  return `${ny}-${pad(nm)}-${pad(Math.min(day, lastDayOfMonth(ny, nm)))}`;
}

// Cuotas que ya se deben registrar como descontadas de la nómina: créditos de
// libranza con registro automático activado, cuyas cuotas pendientes vencen hoy o
// antes. Devuelve, en orden, lo que hay que registrar.
export function dueLibranzaInstallments(credit, payments, todayISO) {
  if (credit.paymentSource !== 'libranza' || !credit.autoRegister || credit.status === 'pagado') return [];
  return [...payments]
    .sort((a, b) => a.installmentNumber - b.installmentNumber)
    .filter((p) => !p.paid)
    .filter((p) => p.dueDate <= todayISO);
}

// Una cuota en pesos. Los créditos en UVR calculan sus cuotas en UVR: para
// registrarlas hay que convertirlas con el valor de la UVR de ese día.
// Devuelve el capital (baja el pasivo) y el costo (intereses + seguro = gasto).
export function installmentInCop(installment, credit, uvrValue) {
  const factor = credit.currency === 'UVR' ? uvrValue : 1;
  if (credit.currency === 'UVR' && !(factor > 0)) throw new Error('Falta el valor de la UVR para convertir la cuota a pesos.');
  const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const { capital, cost } = splitInstallment(installment);
  return { capital: round(capital * factor), cost: round(cost * factor), total: round((capital + cost) * factor) };
}

// Lo que se descuenta de la nómina en un mes (AAAA-MM), sumando los créditos de
// libranza. `paymentsByCredit`: { [creditId]: cuotas }.
export function libranzaDeductionsForMonth(credits, paymentsByCredit, monthKey) {
  return credits
    .filter((c) => c.paymentSource === 'libranza' && c.status !== 'pagado')
    .flatMap((c) => (paymentsByCredit[c.id] || [])
      .filter((p) => p.dueDate.slice(0, 7) === monthKey)
      .map((p) => ({ creditId: c.id, name: c.name, installmentNumber: p.installmentNumber, dueDate: p.dueDate, total: p.total, paid: p.paid })));
}

// Etiquetas para el historial del crédito.
export const CREDIT_EVENT_LABELS = {
  creacion: 'Crédito creado', abono: 'Abono a capital', retanqueo: 'Retanqueo', rediferido: 'Rediferido / reestructuración',
  cambio_condiciones: 'Cambio de condiciones', pago_revertido: 'Pago revertido',
};
