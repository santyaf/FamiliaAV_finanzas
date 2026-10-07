// Portafolio de mercados (divisas, criptoactivos, acciones) — lógica pura, sin red ni React.
// Cada posición se calcula por costo promedio ponderado: cada venta descuenta unidades al costo promedio vigente
// en ese momento y deja su ganancia o pérdida realizada. Todo en pesos (la moneda del hogar).

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const EPS = 1e-8;

export const ASSET_CLASSES = [
  { id: 'divisa', label: 'Divisas', unit: 'USD', unitLabel: 'dólares', maxDecimals: 6 },
  { id: 'cripto', label: 'Criptoactivos', unit: '', unitLabel: 'unidades', maxDecimals: 8 },
  { id: 'accion', label: 'Acciones', unit: '', unitLabel: 'acciones', maxDecimals: 4 },
];
export const assetClassInfo = (id) => ASSET_CLASSES.find((c) => c.id === id) || ASSET_CLASSES[0];

// Orden estable: por fecha, las compras antes que las ventas del mismo día, y luego por creación.
export function sortTrades(trades) {
  return [...(trades || [])].sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
    || (a.side === b.side ? 0 : a.side === 'compra' ? -1 : 1)
    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    || String(a.id).localeCompare(String(b.id)));
}

// trades: [{ id, date, side: 'compra'|'venta', units, cop, createdAt }]
export function computePosition(trades, priceCop = null) {
  let units = 0; let cost = 0; let realized = 0; let bought = 0; let proceeds = 0;
  const rows = sortTrades(trades).map((t) => {
    const unitPrice = t.units > 0 ? t.cop / t.units : 0;
    if (t.side === 'compra') {
      units += t.units; cost += t.cop; bought += t.cop;
      return { ...t, unitPrice, unitsAfter: units };
    }
    const avgCost = units > 0 ? cost / units : 0;
    const costSold = t.units * avgCost;
    const gain = t.cop - costSold;
    realized += gain; proceeds += t.cop; units -= t.units; cost -= costSold;
    if (units < EPS) { units = 0; cost = 0; }
    return { ...t, unitPrice, avgCost, costSold, gain, gainPct: costSold > 0 ? (gain / costSold) * 100 : null, unitsAfter: units };
  });
  const avgCost = units > 0 ? cost / units : null;
  const marketValue = priceCop != null && units > 0 ? units * priceCop : null;
  const unrealized = marketValue != null ? marketValue - cost : null;
  return {
    rows, units: round2Units(units), cost: round2(cost), avgCost, realized: round2(realized), bought: round2(bought), proceeds: round2(proceeds),
    marketValue: marketValue != null ? round2(marketValue) : null,
    unrealized: unrealized != null ? round2(unrealized) : null,
    unrealizedPct: unrealized != null && cost > 0 ? (unrealized / cost) * 100 : null,
  };
}
const round2Units = (n) => Math.round(n * 1e8) / 1e8;

// ¿Aplicar esta lista de operaciones deja las unidades en negativo en algún momento?
export function goesNegative(trades) {
  let units = 0;
  for (const t of sortTrades(trades)) {
    units += t.side === 'compra' ? t.units : -t.units;
    if (units < -EPS) return true;
  }
  return false;
}

// Valida una operación nueva contra las existentes → texto del problema, o '' si está bien.
export function validateTrade(trade, existing, { todayISO } = {}) {
  if (!trade.date) return 'Elige la fecha de la operación.';
  if (todayISO && trade.date > todayISO) return 'La fecha no puede ser futura.';
  if (!(trade.units > 0)) return 'Escribe cuántas unidades fueron.';
  if (!(trade.cop > 0)) return 'Escribe cuántos pesos fueron.';
  if (trade.side === 'venta' && goesNegative([...(existing || []), { ...trade, id: '__nuevo__' }])) {
    const upTo = computePosition((existing || []).filter((t) => t.date <= trade.date));
    return `No puedes vender ${fmtUnits(trade.units)}: a esa fecha solo tenías ${fmtUnits(upTo.units)}.`;
  }
  return '';
}

// ¿Se puede borrar esta operación sin que otras ventas queden sin respaldo?
export function canDeleteTrade(trades, id) {
  const rest = (trades || []).filter((t) => t.id !== id);
  return !goesNegative(rest);
}

const fmtUnits = (n) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 8 }).format(n);

// Resumen de varias posiciones. holdings: [{ id, assetClass }], tradesByHolding: { id: trades }, priceByHolding: { id: precio COP }
export function summarizePortfolio(holdings, tradesByHolding, priceByHolding) {
  const byClass = {};
  const items = [];
  let cost = 0; let value = 0; let realized = 0; let missingPrice = 0;
  (holdings || []).forEach((h) => {
    const price = priceByHolding?.[h.id] ?? null;
    const pos = computePosition(tradesByHolding?.[h.id] || [], price);
    items.push({ holding: h, position: pos });
    realized += pos.realized;
    if (pos.units > 0) {
      cost += pos.cost;
      if (pos.marketValue != null) value += pos.marketValue; else { value += pos.cost; missingPrice += 1; }
      const c = (byClass[h.assetClass] ||= { assetClass: h.assetClass, cost: 0, value: 0 });
      c.cost += pos.cost; c.value += pos.marketValue != null ? pos.marketValue : pos.cost;
    }
  });
  Object.values(byClass).forEach((c) => { c.cost = round2(c.cost); c.value = round2(c.value); c.gain = round2(c.value - c.cost); });
  return {
    items, byClass, cost: round2(cost), value: round2(value), unrealized: round2(value - cost), realized: round2(realized),
    unrealizedPct: cost > 0 ? ((value - cost) / cost) * 100 : null,
    missingPrice, // posiciones valoradas a su costo por no tener precio
  };
}

// Valor de una posición a una fecha (para el patrimonio en el pasado): unidades de ese día × el último precio
// conocido hasta ese día; sin precio, se valora al costo.
export function holdingValueAt(trades, prices, dateISO) {
  const upTo = (trades || []).filter((t) => t.date <= dateISO);
  const pos = computePosition(upTo);
  if (!(pos.units > 0)) return { value: 0, basis: 'sin_posicion' };
  const known = (prices || []).filter((p) => p.date <= dateISO).sort((a, b) => a.date.localeCompare(b.date));
  const last = known[known.length - 1];
  if (last) return { value: round2(pos.units * last.priceCop), basis: 'precio' };
  return { value: pos.cost, basis: 'costo' };
}

// Las posiciones como "activos" para el patrimonio y los informes: su valor a cada fecha sale de las unidades de ese
// día por el último precio guardado (o su costo si aún no hay precio). Solo cuentan como dinero puesto o recibido
// las operaciones ligadas a una cuenta de la app.
export function portfolioAssets(holdings, trades, prices) {
  return (holdings || []).flatMap((h) => {
    const mine = (trades || []).filter((t) => t.holdingId === h.id);
    if (!mine.length) return [];
    const myPrices = (prices || []).filter((p) => p.holdingId === h.id);
    const sorted = sortTrades(mine);
    const dates = [...new Set([...mine.map((t) => t.date), ...myPrices.map((p) => p.date)])].sort();
    return [{
      id: `holding:${h.id}`, source: 'portfolio', name: h.name, kind: 'inversion', ownerMemberId: h.ownerMemberId || null,
      acquiredOn: sorted[0].date, acquisitionCost: 0, status: 'activo', institution: null, annualReturnRate: null,
      valuations: dates.map((date) => ({ date, value: holdingValueAt(mine, myPrices, date).value })),
      flows: mine.filter((t) => t.accountId || t.transactionId).map((t) => ({ date: t.date, amount: t.side === 'compra' ? t.cop : -t.cop })),
    }];
  });
}

// Tasa del dólar que se usa: la de venta de Wenia (a mano) si la elegiste y la escribiste; si no, la TRM.
export function activeUsdRate(settings, trm) {
  if (settings?.fxSource === 'wenia' && settings.weniaSell > 0) return { rate: settings.weniaSell, source: 'wenia' };
  if (trm > 0) return { rate: trm, source: settings?.fxSource === 'wenia' ? 'trm_respaldo' : 'trm' };
  return { rate: null, source: 'ninguna' };
}
export const FX_SOURCE_LABELS = {
  trm: 'TRM · Banco de la República', wenia: 'Wenia · tasa de venta manual',
  trm_respaldo: 'Wenia sin tasa de venta: usando la TRM', ninguna: 'Sin tasa disponible',
};

// ¿La TRM superó tu costo promedio de los dólares? (para el aviso y el banner)
export function fxOpportunity(avgCost, usdUnits, trm) {
  if (!(avgCost > 0) || !(usdUnits > 0) || !(trm > 0)) return null;
  const diff = trm - avgCost;
  return { above: diff > 0, diff: round2(diff), pct: (diff / avgCost) * 100, potentialGain: round2(usdUnits * diff) };
}

// Lectura técnica de una serie diaria [{ date, value }] ascendente: variaciones, volatilidad y cruce de promedios
// móviles de 7 y 30 días. Es momentum histórico, no una predicción.
export function technicalTrend(series) {
  if (!series || series.length < 3) return null;
  const last = series[series.length - 1].value;
  const ago = (n) => (series.length - 1 - n >= 0 ? series[series.length - 1 - n].value : null);
  const pct = (a, b) => (b ? (a / b - 1) * 100 : null);
  const v1 = ago(1) != null ? pct(last, ago(1)) : null;
  const v7 = ago(7) != null ? pct(last, ago(7)) : pct(last, series[0].value);
  const v30 = pct(last, series[0].value);
  const returns = [];
  for (let i = 1; i < series.length; i++) if (series[i - 1].value > 0 && series[i].value > 0) returns.push(Math.log(series[i].value / series[i - 1].value));
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length || 1);
  const sma = (n) => { const arr = series.slice(-Math.min(n, series.length)); return arr.reduce((a, b) => a + b.value, 0) / arr.length; };
  const diff = (sma(7) / sma(30) - 1) * 100;
  let signal = 'neutral';
  let text = 'Sin señal clara: el promedio de 7 días está muy cerca del de 30 días.';
  if (diff > 1.5) { signal = 'alcista'; text = `Momentum alcista: el promedio de los últimos 7 días supera al de 30 días en ${diff.toFixed(2)} %.`; }
  else if (diff < -1.5) { signal = 'bajista'; text = `Momentum bajista: el promedio de los últimos 7 días está ${Math.abs(diff).toFixed(2)} % por debajo del de 30 días.`; }
  return { v1, v7, v30, vol: Math.sqrt(variance) * 100, signal, text };
}

// Precio de un instrumento en pesos a partir de su cotización: si cotiza en COP tal cual; si no, × TRM.
export function priceInCop(price, currency, trm) {
  if (!(price >= 0)) return null;
  if (!currency || currency === 'COP') return price;
  if (currency === 'USD') return trm > 0 ? price * trm : null;
  return null; // otra moneda sin tasa: no se inventa un valor
}
