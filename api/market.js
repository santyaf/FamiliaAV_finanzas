// Datos de mercado para el portafolio (divisas, criptoactivos y acciones). Se consultan desde el servidor para
// (1) no exponer la clave de Twelve Data en el navegador, (2) cachear y no agotar la cuota gratuita compartida
// por todos los hogares, y (3) exigir sesión y límites de uso como el resto de /api.
//
//   ?kind=trm                                  TRM del Banco de la República (datos abiertos) + últimos 30 días
//   ?kind=crypto_markets                       top 100 por capitalización (CoinGecko, en USD)
//   ?kind=crypto_history&id=bitcoin&days=30    serie diaria en USD
//   ?kind=stock&symbol=ECO&exchange=BVC        cotización + 30 días hábiles (Twelve Data; requiere TWELVE_DATA_API_KEY)
//   ?kind=status                               qué fuentes están disponibles (sin consultar a nadie)

import { requireAuth } from './_auth.js';
import { fetchTrm } from './_trm.js';

const COINGECKO = 'https://api.coingecko.com/api/v3';
const TWELVE = 'https://api.twelvedata.com';

const TTL = { trm: 30 * 60e3, crypto_markets: 60e3, crypto_history: 10 * 60e3, stock: 5 * 60e3 };
const LIMITS = {
  stock: { endpoint: 'market_stock', hourly: 60, daily: 150 },
  data: { endpoint: 'market_data', hourly: 300, daily: 1500 },
};

// caché en memoria de esta instancia: varias personas pidiendo lo mismo no repiten la consulta externa
const cache = new Map();
export const _clearCache = () => cache.clear();
async function cached(key, ttl, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const data = await loader();
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return data;
}

async function getJson(url, label) {
  const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'FinanzasHogar/1.0' } });
  if (!res.ok) throw Object.assign(new Error(`${label} respondió ${res.status}`), { status: 502 });
  return res.json();
}

async function loadCryptoMarkets() {
  const rows = await getJson(`${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h`, 'CoinGecko');
  return rows.map((c) => ({
    id: c.id, symbol: String(c.symbol || '').toUpperCase(), name: c.name, image: c.image,
    price: c.current_price, change24h: c.price_change_percentage_24h, marketCap: c.market_cap, rank: c.market_cap_rank,
  }));
}

async function loadCryptoHistory(id, days) {
  const data = await getJson(`${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`, 'CoinGecko');
  const byDate = new Map();
  (data.prices || []).forEach(([t, v]) => byDate.set(new Date(t).toISOString().slice(0, 10), v));
  return { series: [...byDate.entries()].map(([date, value]) => ({ date, value })) };
}

async function loadStock(symbol, exchange, apiKey) {
  const ex = exchange ? `&exchange=${encodeURIComponent(exchange)}` : '';
  const key = `&apikey=${encodeURIComponent(apiKey)}`;
  const [quote, series] = await Promise.all([
    getJson(`${TWELVE}/quote?symbol=${encodeURIComponent(symbol)}${ex}${key}`, 'Twelve Data'),
    getJson(`${TWELVE}/time_series?symbol=${encodeURIComponent(symbol)}${ex}&interval=1day&outputsize=30${key}`, 'Twelve Data'),
  ]);
  if (quote.code || quote.status === 'error') {
    throw Object.assign(new Error(quote.message || 'Símbolo no disponible'), { status: quote.code === 401 || quote.code === 403 ? 503 : 404 });
  }
  const price = parseFloat(quote.close);
  if (!Number.isFinite(price)) throw Object.assign(new Error('La cotización llegó vacía'), { status: 502 });
  return {
    price, currency: quote.currency || null, changePct: Number.isFinite(parseFloat(quote.percent_change)) ? parseFloat(quote.percent_change) : null,
    exchange: quote.exchange || exchange || null, name: quote.name || symbol,
    series: (series.values || []).map((v) => ({ date: String(v.datetime).slice(0, 10), value: parseFloat(v.close) })).filter((p) => Number.isFinite(p.value)).reverse(),
  };
}

const ID_RE = /^[a-z0-9-]{1,60}$/;
const SYMBOL_RE = /^[A-Za-z0-9._-]{1,20}$/;
const EXCHANGE_RE = /^[A-Za-z]{2,12}$/;

export default async function handler(req, res) {
  const q = req.query || {};
  const kind = String(q.kind || '');
  if (!['trm', 'crypto_markets', 'crypto_history', 'stock', 'status'].includes(kind)) {
    return res.status(400).json({ error: 'kind no válido' });
  }
  if (await requireAuth(req, res, { limit: kind === 'stock' ? LIMITS.stock : LIMITS.data })) return;

  try {
    if (kind === 'status') {
      return res.status(200).json({ trm: true, crypto: true, stocks: !!process.env.TWELVE_DATA_API_KEY });
    }
    if (kind === 'trm') {
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
      return res.status(200).json(await cached('trm', TTL.trm, () => fetchTrm()));
    }
    if (kind === 'crypto_markets') {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(await cached('crypto_markets', TTL.crypto_markets, loadCryptoMarkets));
    }
    if (kind === 'crypto_history') {
      const id = String(q.id || '');
      if (!ID_RE.test(id)) return res.status(400).json({ error: 'id de criptoactivo no válido' });
      const days = Math.min(90, Math.max(1, parseInt(q.days, 10) || 30));
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
      return res.status(200).json(await cached(`ch:${id}:${days}`, TTL.crypto_history, () => loadCryptoHistory(id, days)));
    }
    // stock
    const symbol = String(q.symbol || '');
    const exchange = q.exchange ? String(q.exchange) : '';
    if (!SYMBOL_RE.test(symbol) || (exchange && !EXCHANGE_RE.test(exchange))) return res.status(400).json({ error: 'símbolo o bolsa no válidos' });
    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'sin_clave', message: 'Las acciones aún no están activadas: falta configurar la clave de Twelve Data en el servidor.' });
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(200).json(await cached(`st:${exchange}:${symbol}`, TTL.stock, () => loadStock(symbol, exchange, apiKey)));
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}
