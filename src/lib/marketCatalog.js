// Acciones que se ofrecen para seguir. Los símbolos de la BVC se consultan en Twelve Data con exchange=BVC;
// si alguno no responde, se puede agregar a mano con su símbolo y bolsa (ver `customStock`).
const BVC = [
  ['ECO', 'Ecopetrol S.A.'], ['BIC', 'Bancolombia S.A.'], ['BIC_p1', 'Bancolombia S.A. Pref'],
  ['ISA', 'Interconexión Eléctrica (ISA)'], ['SIS', 'Grupo de Inversiones Suramericana'], ['SIS_p', 'Grupo Sura Pref'],
  ['ARG', 'Grupo Argos S.A.'], ['ARG_p', 'Grupo Argos Pref'], ['CCB', 'Cementos Argos S.A.'], ['CCB_p', 'Cementos Argos Pref'],
  ['NCH', 'Grupo Nutresa S.A.'], ['CEL', 'Celsia S.A.'], ['GEB', 'Grupo Energía Bogotá'],
  ['GAA', 'Grupo Aval Acciones y Valores'], ['GAA_p', 'Grupo Aval Pref'], ['CFV', 'Corficolombiana S.A.'],
  ['BBO', 'Banco de Bogotá S.A.'], ['DVI_p', 'Banco Davivienda Pref'], ['PMG', 'Promigas S.A.'],
  ['TPL', 'Organización Terpel S.A.'], ['ETB', 'ETB S.A. ESP'], ['MAS', 'Mineros S.A.'],
  ['IMI', 'Almacenes Éxito S.A.'], ['VLL', 'Banco Comercial AV Villas'], ['CLM', 'Colombina S.A.'],
];
const GLOBAL = [
  ['AAPL', 'Apple Inc.', 'NASDAQ', 'Estados Unidos'], ['MSFT', 'Microsoft Corporation', 'NASDAQ', 'Estados Unidos'],
  ['GOOGL', 'Alphabet Inc. (Google)', 'NASDAQ', 'Estados Unidos'], ['AMZN', 'Amazon.com Inc.', 'NASDAQ', 'Estados Unidos'],
  ['NVDA', 'NVIDIA Corporation', 'NASDAQ', 'Estados Unidos'], ['META', 'Meta Platforms Inc.', 'NASDAQ', 'Estados Unidos'],
  ['TSLA', 'Tesla Inc.', 'NASDAQ', 'Estados Unidos'], ['BRK.B', 'Berkshire Hathaway', 'NYSE', 'Estados Unidos'],
  ['JPM', 'JPMorgan Chase & Co.', 'NYSE', 'Estados Unidos'], ['V', 'Visa Inc.', 'NYSE', 'Estados Unidos'],
  ['JNJ', 'Johnson & Johnson', 'NYSE', 'Estados Unidos'], ['WMT', 'Walmart Inc.', 'NYSE', 'Estados Unidos'],
  ['PG', 'Procter & Gamble', 'NYSE', 'Estados Unidos'], ['TSM', 'Taiwan Semiconductor (ADR)', 'NYSE', 'Taiwán'],
  ['BABA', 'Alibaba Group (ADR)', 'NYSE', 'China'], ['ASML', 'ASML Holding', 'NASDAQ', 'Países Bajos'],
  ['NVO', 'Novo Nordisk (ADR)', 'NYSE', 'Dinamarca'], ['SAP', 'SAP SE (ADR)', 'NYSE', 'Alemania'],
  ['TM', 'Toyota Motor (ADR)', 'NYSE', 'Japón'], ['SHEL', 'Shell plc (ADR)', 'NYSE', 'Reino Unido'],
];

export const STOCK_CATALOG = [
  ...BVC.map(([symbol, name]) => ({ symbol, name, exchange: 'BVC', country: 'Colombia', market: 'BVC', quoteCurrency: 'COP' })),
  ...GLOBAL.map(([symbol, name, exchange, country]) => ({ symbol, name, exchange, country, market: 'Global', quoteCurrency: 'USD' })),
];

export function searchStocks(query, catalog = STOCK_CATALOG) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return catalog;
  return catalog.filter((s) => s.name.toLowerCase().includes(q) || s.symbol.toLowerCase().includes(q) || s.exchange.toLowerCase().includes(q) || s.country.toLowerCase().includes(q));
}

// Un símbolo que no está en la lista: se valida su forma (la existencia la confirma el proveedor al consultarlo).
export function customStock(symbol, exchange) {
  const sym = String(symbol || '').trim().toUpperCase();
  const ex = String(exchange || '').trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,20}$/.test(sym)) return { error: 'Escribe un símbolo válido (letras, números, punto o guion).' };
  if (ex && !/^[A-Z]{2,12}$/.test(ex)) return { error: 'La bolsa debe ser solo letras, por ejemplo NYSE, NASDAQ o BVC.' };
  return { stock: { symbol: sym, name: sym, exchange: ex || '', country: '', market: 'Otro', quoteCurrency: ex === 'BVC' ? 'COP' : 'USD' } };
}

export const stockLabel = (s) => `${s.name} (${s.symbol}${s.exchange ? ` · ${s.exchange}` : ''})`;
