// Decisiones de los avisos push programados (resumen mensual y vencimiento de tarjetas) — lógica pura para
// poder probarla; api/send-reminders.js solo consulta la base y envía.

const pad = (n) => String(n).padStart(2, '0');
export const DEFAULT_TIMEZONE = 'America/Bogota';
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Fecha y hora locales en una zona horaria IANA.
export function localParts(now, timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = parseInt(get('hour'), 10) % 24; // algunos motores devuelven "24" a medianoche
  return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, monthKey: `${get('year')}-${get('month')}`, day: parseInt(get('day'), 10), hour, minute: parseInt(get('minute'), 10) };
}

export function previousMonthOf(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  return { key, label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
}

// Resumen mensual: en los primeros 5 días del mes, desde las 9:00 locales, una sola vez por mes
// (si el cron estuvo caído el día 1, se recupera en los días siguientes).
export function shouldSendDigest(local, alreadySentForMonth) {
  return !alreadySentForMonth && local.day >= 1 && local.day <= 5 && local.hour >= 9;
}

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// Próxima fecha límite de pago de una tarjeta (día del mes, ajustado a meses cortos) desde hoy (incluido).
export function nextPaymentDate(paymentDay, todayISO) {
  if (!paymentDay) return null;
  const y = Number(todayISO.slice(0, 4)); const m = Number(todayISO.slice(5, 7));
  const thisMonth = `${y}-${pad(m)}-${pad(Math.min(paymentDay, daysInMonth(y, m)))}`;
  if (thisMonth >= todayISO) return thisMonth;
  const ny = m === 12 ? y + 1 : y; const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(paymentDay, daysInMonth(ny, nm)))}`;
}

// ¿Hay que avisar del pago de esta tarjeta? A partir de `daysBefore` días antes (y hasta el día) y solo
// desde las 8:00 locales. Devuelve { dueDate, daysLeft } o null. La función que envía guarda `dueDate`
// en un log para no repetir el aviso.
export function cardPaymentAlert({ paymentDay }, local, daysBefore = 2) {
  if (!paymentDay || local.hour < 8) return null;
  const dueDate = nextPaymentDate(paymentDay, local.dateStr);
  const daysLeft = daysBetween(local.dateStr, dueDate);
  return daysLeft >= 0 && daysLeft <= daysBefore ? { dueDate, daysLeft } : null;
}

export function cardAlertText(name, alert) {
  const when = alert.daysLeft === 0 ? 'hoy' : alert.daysLeft === 1 ? 'mañana' : `en ${alert.daysLeft} días`;
  return { title: `Pago de tarjeta ${name}`, body: `Vence ${when}. Págala a tiempo para no generar intereses de mora.` };
}
