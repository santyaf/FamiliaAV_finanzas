import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let authorized = true;
const requireAuth = vi.fn(async (req, res) => {
  if (!authorized) { res.status(401).json({ error: 'No autenticado' }); return true; }
  return false;
});
vi.mock('./_auth.js', () => ({ requireAuth: (...a) => requireAuth(...a) }));

import handler, { _clearCache } from './market.js';

const makeRes = () => {
  const r = { headers: {}, statusCode: 200, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const call = async (query) => { const res = makeRes(); await handler({ query, headers: {} }, res); return res; };
const jsonResponse = (data, ok = true, status = 200) => ({ ok, status, json: async () => data });

let fetchMock;
beforeEach(() => { authorized = true; requireAuth.mockClear(); _clearCache(); fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); delete process.env.TWELVE_DATA_API_KEY; });
afterEach(() => vi.unstubAllGlobals());

describe('/api/market', () => {
  it('rechaza kinds desconocidos antes de pedir nada', async () => {
    const r = await call({ kind: 'otro' });
    expect(r.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('exige sesión', async () => {
    authorized = false;
    const r = await call({ kind: 'trm' });
    expect(r.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('TRM: ordena la serie de menor a mayor fecha y entrega la última', async () => {
    fetchMock.mockResolvedValue(jsonResponse([
      { valor: '3216.01', vigenciadesde: '2026-10-07T00:00:00.000' },
      { valor: '3209.78', vigenciadesde: '2026-10-06T00:00:00.000' },
      { valor: 'basura', vigenciadesde: '2026-10-05T00:00:00.000' },
    ]));
    const r = await call({ kind: 'trm' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ value: 3216.01, date: '2026-10-07', series: [{ date: '2026-10-06', value: 3209.78 }, { date: '2026-10-07', value: 3216.01 }] });
    expect(r.headers['Cache-Control']).toMatch(/s-maxage=900/);
  });
  it('la segunda consulta igual sale de la caché (no vuelve a la fuente externa)', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ valor: '3000', vigenciadesde: '2026-10-07T00:00:00.000' }]));
    await call({ kind: 'trm' });
    await call({ kind: 'trm' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('si la fuente falla responde 502 con el motivo', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));
    const r = await call({ kind: 'trm' });
    expect(r.statusCode).toBe(502);
    expect(r.body.error).toMatch(/Datos abiertos/);
  });

  it('cripto: lista reducida a lo que usa la app', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', image: 'x.png', current_price: 83000, price_change_percentage_24h: -3.1, market_cap: 1e12, market_cap_rank: 1, otro: 'ignorado' }]));
    const r = await call({ kind: 'crypto_markets' });
    expect(r.body).toEqual([{ id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', image: 'x.png', price: 83000, change24h: -3.1, marketCap: 1e12, rank: 1 }]);
  });
  it('cripto histórico: valida el id y convierte la serie', async () => {
    expect((await call({ kind: 'crypto_history', id: '../etc' })).statusCode).toBe(400);
    fetchMock.mockResolvedValue(jsonResponse({ prices: [[1791158400000, 86000], [1791244800000, 85000], [1791244900000, 85100]] }));
    const r = await call({ kind: 'crypto_history', id: 'bitcoin', days: '999' });
    expect(fetchMock.mock.calls[0][0]).toContain('days=90'); // tope
    expect(r.body.series).toHaveLength(2); // el último valor del día reemplaza al anterior
    expect(r.body.series[1].value).toBe(85100);
  });

  it('acciones: sin clave configurada avisa claramente y no consulta', async () => {
    const r = await call({ kind: 'stock', symbol: 'ECO', exchange: 'BVC' });
    expect(r.statusCode).toBe(503);
    expect(r.body.error).toBe('sin_clave');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('acciones: valida símbolo y bolsa', async () => {
    process.env.TWELVE_DATA_API_KEY = 'k';
    expect((await call({ kind: 'stock', symbol: 'A B' })).statusCode).toBe(400);
    expect((await call({ kind: 'stock', symbol: 'AAPL', exchange: 'NY SE;' })).statusCode).toBe(400);
  });
  it('acciones: cotización y serie, sin filtrar la clave en la respuesta', async () => {
    process.env.TWELVE_DATA_API_KEY = 'SECRETA';
    fetchMock.mockImplementation(async (url) => (url.includes('/quote')
      ? jsonResponse({ close: '215.5', currency: 'USD', percent_change: '1.25', exchange: 'NASDAQ', name: 'Apple Inc' })
      : jsonResponse({ values: [{ datetime: '2026-10-07', close: '215.5' }, { datetime: '2026-10-06', close: '212.8' }] })));
    const r = await call({ kind: 'stock', symbol: 'AAPL' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ price: 215.5, currency: 'USD', changePct: 1.25, exchange: 'NASDAQ', name: 'Apple Inc' });
    expect(r.body.series.map((p) => p.date)).toEqual(['2026-10-06', '2026-10-07']);
    expect(JSON.stringify(r.body)).not.toContain('SECRETA');
  });
  it('acciones: un símbolo que Twelve Data no conoce es 404 y una clave mala, 503', async () => {
    process.env.TWELVE_DATA_API_KEY = 'k';
    fetchMock.mockResolvedValue(jsonResponse({ code: 404, status: 'error', message: 'symbol not found' }));
    expect((await call({ kind: 'stock', symbol: 'NOPE' })).statusCode).toBe(404);
    _clearCache();
    fetchMock.mockResolvedValue(jsonResponse({ code: 401, status: 'error', message: 'apikey invalid' }));
    expect((await call({ kind: 'stock', symbol: 'AAPL' })).statusCode).toBe(503);
  });
  it('estado: dice si las acciones están activadas, sin consultar a nadie', async () => {
    expect((await call({ kind: 'status' })).body).toEqual({ trm: true, crypto: true, stocks: false });
    process.env.TWELVE_DATA_API_KEY = 'k';
    expect((await call({ kind: 'status' })).body.stocks).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('las acciones tienen un límite de uso más estricto que el resto', async () => {
    process.env.TWELVE_DATA_API_KEY = 'k';
    fetchMock.mockResolvedValue(jsonResponse({ close: '1', values: [] }));
    await call({ kind: 'stock', symbol: 'AAPL' });
    await call({ kind: 'trm' });
    expect(requireAuth.mock.calls[0][2].limit.endpoint).toBe('market_stock');
    expect(requireAuth.mock.calls[1][2].limit.endpoint).toBe('market_data');
  });
});
