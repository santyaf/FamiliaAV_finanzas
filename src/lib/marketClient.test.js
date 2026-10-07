import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let session = { access_token: 'tok' };
vi.mock('./supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session } }) } } }));
import { fetchMarket, marketErrorText } from './market';

let fetchMock;
beforeEach(() => { session = { access_token: 'tok' }; fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const resp = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

describe('fetchMarket', () => {
  it('pide con la sesión y los parámetros en la URL', async () => {
    fetchMock.mockResolvedValue(resp({ value: 4000 }));
    expect(await fetchMarket('crypto_history', { id: 'bitcoin', days: '30' })).toEqual({ value: 4000 });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/market?kind=crypto_history&id=bitcoin&days=30');
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });
  it('sin sesión no manda encabezado (el servidor responderá 401)', async () => {
    session = null;
    fetchMock.mockResolvedValue(resp({ error: 'No autenticado' }, false, 401));
    await expect(fetchMarket('trm')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });
  it('un error trae el mensaje, el código y el estado', async () => {
    fetchMock.mockResolvedValue(resp({ error: 'sin_clave', message: 'falta la clave' }, false, 503));
    await expect(fetchMarket('stock', { symbol: 'AAPL' })).rejects.toMatchObject({ message: 'falta la clave', code: 'sin_clave', status: 503 });
  });
  it('una respuesta sin cuerpo igual da un mensaje claro', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('vacío'); } });
    await expect(fetchMarket('trm')).rejects.toThrow(/500/);
  });
});

describe('marketErrorText', () => {
  it('traduce cada caso a algo que la persona entienda', () => {
    expect(marketErrorText({ code: 'sin_clave' })).toMatch(/Twelve Data/);
    expect(marketErrorText({ status: 401 })).toMatch(/sesión/);
    expect(marketErrorText({ status: 429, message: 'Espera 5 min' })).toBe('Espera 5 min');
    expect(marketErrorText({ status: 404 })).toMatch(/no existe/);
    expect(marketErrorText({ status: 502 })).toMatch(/último guardado/);
    expect(marketErrorText(null)).toBe('');
  });
});
