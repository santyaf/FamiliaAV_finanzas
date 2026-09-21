// Activos e inversiones — lógica pura, sin red ni React.
// Un activo (propiedad, vehículo, inversión, cuenta por cobrar…) tiene un costo de adquisición y un
// historial de valoraciones fechadas. Su valor a una fecha sale de la última valoración anterior a
// esa fecha (o del costo); una inversión con rentabilidad estimada (CDT) crece sola hasta su vencimiento.

export const ASSET_KINDS = [
  { id: 'propiedad', label: 'Propiedad (inmueble)' },
  { id: 'vehiculo', label: 'Vehículo' },
  { id: 'inversion', label: 'Inversión (CDT, acciones, fondos, cripto)' },
  { id: 'por_cobrar', label: 'Cuenta por cobrar (me deben)' },
  { id: 'otro', label: 'Otro bien' },
];
export const assetKindLabel = (id) => ASSET_KINDS.find((k) => k.id === id)?.label || 'Otro bien';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const daysBetween = (fromISO, toISO) => Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);

// { value, basis }: basis = 'valoracion' | 'costo' | 'estimado' (crecimiento por rentabilidad) | 'vendido' | 'no_existia'
export function assetValueAt(asset, valuations, dateISO) {
  if (asset.acquiredOn && asset.acquiredOn > dateISO) return { value: 0, basis: 'no_existia' };
  if (asset.status === 'vendido' && asset.soldOn && asset.soldOn <= dateISO) return { value: 0, basis: 'vendido' };

  const past = (valuations || []).filter((v) => v.date <= dateISO).sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const last = past[past.length - 1];
  let base = last ? last.value : (asset.acquisitionCost || 0);
  const since = last ? last.date : asset.acquiredOn;
  let basis = last ? 'valoracion' : 'costo';

  const rate = asset.annualReturnRate;
  if (rate > 0 && since && base > 0) {
    const until = asset.maturityDate && asset.maturityDate < dateISO ? asset.maturityDate : dateISO;
    const days = daysBetween(since, until);
    if (days > 0) { base *= Math.pow(1 + rate / 100, days / 365); basis = 'estimado'; }
  }
  return { value: round2(base), basis };
}

// Ganancia o pérdida contra el costo (null si no hay costo con que comparar).
export function assetGain(asset, currentValue) {
  const cost = asset.acquisitionCost || 0;
  if (!(cost > 0)) return null;
  const amount = round2(currentValue - cost);
  return { amount, pct: round2((amount / cost) * 100) };
}

// Resumen por tipo de un conjunto de activos a una fecha (solo los que existen y no se vendieron).
export function summarizeAssets(assets, dateISO) {
  const byKind = {};
  let total = 0;
  assets.forEach((a) => {
    const { value } = assetValueAt(a, a.valuations, dateISO);
    if (value <= 0) return;
    (byKind[a.kind] ||= { kind: a.kind, total: 0, items: [] });
    byKind[a.kind].total = round2(byKind[a.kind].total + value);
    byKind[a.kind].items.push({ assetId: a.id, name: a.name, value });
    total += value;
  });
  return { byKind, total: round2(total) };
}

// Cuánto se valorizó (o perdió valor) un activo en un período, sin contar el dinero puesto o retirado:
//   valor final - valor inicial - lo invertido en el período + lo recibido al vender.
// "Invertido" es el costo si se adquirió dentro del período. Si el activo se recibió sin pagarlo desde
// una cuenta de la app (herencia, regalo, o se cargó tarde), aparece aquí como valorización.
export function assetRevaluation(asset, valuations, startISO, endISO) {
  const before = dayBefore(startISO);
  const vStart = assetValueAt(asset, valuations, before).value;
  const vEnd = assetValueAt(asset, valuations, endISO).value;
  const boughtInPeriod = asset.acquiredOn && asset.acquiredOn >= startISO && asset.acquiredOn <= endISO;
  const soldInPeriod = asset.status === 'vendido' && asset.soldOn && asset.soldOn >= startISO && asset.soldOn <= endISO;
  const invested = boughtInPeriod ? (asset.acquisitionCost || 0) : 0;
  const proceeds = soldInPeriod ? (asset.soldAmount || 0) : 0;
  // al vender, el valor final es 0: la valorización es lo cobrado menos el último valor en libros
  return round2(vEnd - vStart - invested + proceeds);
}

export function dayBefore(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Saldo de un crédito a una fecha, con la tabla de amortización actual: el saldo después de la última
// cuota pagada hasta esa fecha (paidDate; si falta, su vencimiento). Antes del inicio, 0. Es una
// estimación: un abono a capital o un rediferido posterior cambian la tabla.
export function creditBalanceAt(credit, payments, dateISO) {
  if (credit.startDate && credit.startDate > dateISO) return 0;
  const sorted = [...(payments || [])].sort((a, b) => a.installmentNumber - b.installmentNumber);
  if (!sorted.length) return round2(credit.principal || 0);
  let balance = credit.principal || 0;
  sorted.forEach((p) => {
    if (p.paid && (p.paidDate || p.dueDate) <= dateISO) balance = p.balanceAfter;
  });
  return round2(balance);
}
