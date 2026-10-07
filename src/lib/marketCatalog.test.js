import { describe, it, expect } from 'vitest';
import { STOCK_CATALOG, searchStocks, customStock, stockLabel } from './marketCatalog';

describe('catálogo de acciones', () => {
  it('trae la BVC y mercados globales, con la moneda en que cotizan', () => {
    expect(STOCK_CATALOG.find((s) => s.symbol === 'ECO')).toMatchObject({ exchange: 'BVC', quoteCurrency: 'COP', country: 'Colombia' });
    expect(STOCK_CATALOG.find((s) => s.symbol === 'AAPL')).toMatchObject({ exchange: 'NASDAQ', quoteCurrency: 'USD' });
    expect(new Set(STOCK_CATALOG.map((s) => `${s.exchange}:${s.symbol}`)).size).toBe(STOCK_CATALOG.length); // sin repetidos
  });
  it('busca por nombre, símbolo, bolsa o país sin importar mayúsculas', () => {
    expect(searchStocks('ecopetrol').map((s) => s.symbol)).toEqual(['ECO']);
    expect(searchStocks('aapl')).toHaveLength(1);
    expect(searchStocks('nyse').every((s) => s.exchange === 'NYSE')).toBe(true);
    expect(searchStocks('japón').map((s) => s.symbol)).toEqual(['TM']);
    expect(searchStocks('')).toHaveLength(STOCK_CATALOG.length);
    expect(searchStocks('zzzz')).toEqual([]);
  });
  it('un símbolo a mano se normaliza y se valida', () => {
    expect(customStock(' sofi ', 'nasdaq').stock).toMatchObject({ symbol: 'SOFI', exchange: 'NASDAQ', quoteCurrency: 'USD' });
    expect(customStock('xyz', 'bvc').stock.quoteCurrency).toBe('COP');
    expect(customStock('xyz', '').stock.exchange).toBe('');
    expect(customStock('a b', '').error).toMatch(/símbolo válido/);
    expect(customStock('', '').error).toBeTruthy();
    expect(customStock('ok', 'n y').error).toMatch(/bolsa/);
  });
  it('etiqueta legible', () => {
    expect(stockLabel({ name: 'Apple Inc.', symbol: 'AAPL', exchange: 'NASDAQ' })).toBe('Apple Inc. (AAPL · NASDAQ)');
    expect(stockLabel({ name: 'X', symbol: 'X', exchange: '' })).toBe('X (X)');
  });
});
