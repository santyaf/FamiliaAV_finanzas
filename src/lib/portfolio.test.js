import { describe, it, expect } from 'vitest';
import {
  computePosition, goesNegative, validateTrade, canDeleteTrade, summarizePortfolio, holdingValueAt,
  activeUsdRate, fxOpportunity, technicalTrend, priceInCop, sortTrades, assetClassInfo, FX_SOURCE_LABELS, portfolioAssets,
} from './portfolio';
import { assetValueAt, assetRevaluation, allAssets } from './assets';

const buy = (id, date, units, cop) => ({ id, date, side: 'compra', units, cop });
const sell = (id, date, units, cop) => ({ id, date, side: 'venta', units, cop });

describe('computePosition — costo promedio ponderado', () => {
  it('suma compras: costo, unidades y precio promedio', () => {
    const p = computePosition([buy('a', '2026-01-01', 100, 400000), buy('b', '2026-02-01', 100, 420000)]);
    expect(p).toMatchObject({ units: 200, cost: 820000, bought: 820000, realized: 0 });
    expect(p.avgCost).toBe(4100);
    expect(p.marketValue).toBeNull();
  });
  it('una venta descuenta al costo promedio vigente y deja su ganancia realizada', () => {
    const p = computePosition([buy('a', '2026-01-01', 100, 400000), buy('b', '2026-02-01', 100, 420000), sell('c', '2026-03-01', 50, 230000)]);
    // promedio 4.100 → vender 50 cuesta 205.000; se recibió 230.000 → +25.000
    expect(p.rows[2]).toMatchObject({ avgCost: 4100, costSold: 205000, gain: 25000 });
    expect(p.rows[2].gainPct).toBeCloseTo(12.195, 2);
    expect(p).toMatchObject({ units: 150, cost: 615000, realized: 25000, proceeds: 230000 });
  });
  it('valora a mercado y calcula el resultado no realizado', () => {
    const p = computePosition([buy('a', '2026-01-01', 100, 400000)], 4200);
    expect(p).toMatchObject({ marketValue: 420000, unrealized: 20000 });
    expect(p.unrealizedPct).toBeCloseTo(5, 5);
  });
  it('al vender todo, la posición queda en cero y el costo no arrastra residuos', () => {
    const p = computePosition([buy('a', '2026-01-01', 0.1, 1000), buy('b', '2026-01-02', 0.2, 2000), sell('c', '2026-01-03', 0.3, 3500)], 12000);
    expect(p.units).toBe(0);
    expect(p.cost).toBe(0);
    expect(p.avgCost).toBeNull();
    expect(p.marketValue).toBeNull();
    expect(p.realized).toBe(500);
  });
  it('compras antes que ventas el mismo día, sin importar el orden de la lista', () => {
    const p = computePosition([sell('v', '2026-01-01', 10, 50000), buy('c', '2026-01-01', 10, 40000)]);
    expect(p.rows.map((r) => r.side)).toEqual(['compra', 'venta']);
    expect(p.realized).toBe(10000);
  });
  it('sin operaciones', () => {
    expect(computePosition([])).toMatchObject({ units: 0, cost: 0, avgCost: null, realized: 0 });
    expect(computePosition(undefined).rows).toEqual([]);
  });
  it('sortTrades no modifica la lista original', () => {
    const list = [sell('v', '2026-01-02', 1, 1), buy('c', '2026-01-01', 1, 1)];
    sortTrades(list);
    expect(list[0].id).toBe('v');
  });
});

describe('validaciones', () => {
  const existing = [buy('a', '2026-01-10', 10, 100000), sell('s', '2026-02-10', 4, 50000)];
  it('detecta cuando las unidades quedarían en negativo', () => {
    expect(goesNegative(existing)).toBe(false);
    expect(goesNegative([...existing, sell('x', '2026-03-01', 7, 1)])).toBe(true);
    expect(goesNegative([sell('x', '2026-01-01', 1, 1), buy('a', '2026-01-02', 5, 1)])).toBe(true); // vendió antes de comprar
  });
  it('no deja vender más de lo que había a esa fecha (aunque hoy tenga más)', () => {
    const later = [buy('a', '2026-01-10', 10, 100000), buy('b', '2026-06-01', 50, 500000)];
    const msg = validateTrade({ side: 'venta', date: '2026-03-01', units: 20, cop: 1 }, later, { todayISO: '2026-09-01' });
    expect(msg).toMatch(/solo tenías 10/);
    expect(validateTrade({ side: 'venta', date: '2026-07-01', units: 20, cop: 1 }, later)).toBe('');
  });
  it('una venta no puede dejar sin respaldo a otra posterior', () => {
    // 10 compradas, 8 vendidas el 10 feb: vender 5 el 1 feb dejaría la del 10 feb sin unidades
    const base = [buy('a', '2026-01-10', 10, 1), sell('s', '2026-02-10', 8, 1)];
    expect(validateTrade({ side: 'venta', date: '2026-02-01', units: 5, cop: 1 }, base)).toMatch(/No puedes vender/);
  });
  it('campos obligatorios y fecha futura', () => {
    expect(validateTrade({ side: 'compra', date: '', units: 1, cop: 1 }, [])).toMatch(/fecha/);
    expect(validateTrade({ side: 'compra', date: '2026-01-01', units: 0, cop: 1 }, [])).toMatch(/unidades/);
    expect(validateTrade({ side: 'compra', date: '2026-01-01', units: 1, cop: 0 }, [])).toMatch(/pesos/);
    expect(validateTrade({ side: 'compra', date: '2027-01-01', units: 1, cop: 1 }, [], { todayISO: '2026-09-01' })).toMatch(/futura/);
    expect(validateTrade({ side: 'compra', date: '2026-01-01', units: 1, cop: 1 }, [])).toBe('');
  });
  it('borrar una compra solo si lo vendido sigue respaldado', () => {
    const t = [buy('a', '2026-01-10', 10, 1), buy('b', '2026-01-11', 5, 1), sell('s', '2026-02-10', 12, 1)];
    expect(canDeleteTrade(t, 'b')).toBe(false); // quedarían 10 para vender 12
    expect(canDeleteTrade(t, 's')).toBe(true);
    expect(canDeleteTrade([buy('a', '2026-01-10', 10, 1), sell('s', '2026-02-10', 5, 1)], 'a')).toBe(false);
  });
});

describe('summarizePortfolio', () => {
  const holdings = [{ id: 'usd', assetClass: 'divisa' }, { id: 'btc', assetClass: 'cripto' }, { id: 'eco', assetClass: 'accion' }];
  const trades = {
    usd: [buy('1', '2026-01-01', 100, 400000)],
    btc: [buy('2', '2026-01-01', 0.01, 3000000), sell('3', '2026-02-01', 0.004, 1500000)],
    eco: [buy('4', '2026-01-01', 10, 20000)],
  };
  it('totales, por clase y realizado', () => {
    const s = summarizePortfolio(holdings, trades, { usd: 4200, btc: 400000000 });
    // usd: 420.000; btc: 0.006 × 400.000.000 = 2.400.000; eco sin precio → a su costo 20.000
    expect(s.value).toBe(2840000);
    expect(s.cost).toBe(400000 + 1800000 + 20000);
    expect(s.realized).toBe(300000); // 1.500.000 − (0.004 × 300.000.000 = 1.200.000)
    expect(s.missingPrice).toBe(1);
    expect(s.byClass.cripto).toMatchObject({ cost: 1800000, value: 2400000, gain: 600000 });
  });
  it('sin posiciones', () => {
    expect(summarizePortfolio([], {}, {})).toMatchObject({ cost: 0, value: 0, unrealizedPct: null });
  });
});

describe('holdingValueAt', () => {
  const trades = [buy('a', '2026-01-10', 10, 100000), sell('s', '2026-03-01', 4, 60000)];
  const prices = [{ date: '2026-02-01', priceCop: 11000 }, { date: '2026-04-01', priceCop: 12000 }];
  it('usa unidades de esa fecha y el último precio conocido', () => {
    expect(holdingValueAt(trades, prices, '2026-02-15')).toEqual({ value: 110000, basis: 'precio' });
    expect(holdingValueAt(trades, prices, '2026-03-15')).toEqual({ value: 66000, basis: 'precio' }); // 6 × 11.000
    expect(holdingValueAt(trades, prices, '2026-04-15')).toEqual({ value: 72000, basis: 'precio' });
  });
  it('sin precio conocido, al costo; antes de comprar, cero', () => {
    expect(holdingValueAt(trades, prices, '2026-01-15')).toEqual({ value: 100000, basis: 'costo' });
    expect(holdingValueAt(trades, prices, '2026-01-01')).toEqual({ value: 0, basis: 'sin_posicion' });
  });
});

describe('dólar', () => {
  it('tasa activa: Wenia si está elegida y escrita; si no, la TRM', () => {
    expect(activeUsdRate({ fxSource: 'trm' }, 4000)).toEqual({ rate: 4000, source: 'trm' });
    expect(activeUsdRate({ fxSource: 'wenia', weniaSell: 4040 }, 4000)).toEqual({ rate: 4040, source: 'wenia' });
    expect(activeUsdRate({ fxSource: 'wenia', weniaSell: null }, 4000)).toEqual({ rate: 4000, source: 'trm_respaldo' });
    expect(activeUsdRate({ fxSource: 'trm' }, null)).toEqual({ rate: null, source: 'ninguna' });
    Object.keys({ trm: 1, wenia: 1, trm_respaldo: 1, ninguna: 1 }).forEach((k) => expect(FX_SOURCE_LABELS[k]).toBeTruthy());
  });
  it('oportunidad: TRM sobre el costo promedio, con la ganancia potencial', () => {
    expect(fxOpportunity(4000, 100, 4200)).toEqual({ above: true, diff: 200, pct: 5, potentialGain: 20000 });
    expect(fxOpportunity(4000, 100, 3900)).toMatchObject({ above: false, diff: -100, potentialGain: -10000 });
    expect(fxOpportunity(null, 100, 4200)).toBeNull();
    expect(fxOpportunity(4000, 0, 4200)).toBeNull();
    expect(fxOpportunity(4000, 100, null)).toBeNull();
  });
  it('precio en pesos según la moneda de cotización', () => {
    expect(priceInCop(100, 'COP', 4000)).toBe(100);
    expect(priceInCop(100, undefined, 4000)).toBe(100);
    expect(priceInCop(10, 'USD', 4000)).toBe(40000);
    expect(priceInCop(10, 'USD', null)).toBeNull();
    expect(priceInCop(10, 'EUR', 4000)).toBeNull();
    expect(priceInCop(-1, 'COP', 4000)).toBeNull();
  });
});

describe('technicalTrend', () => {
  const series = (values) => values.map((value, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, value }));
  it('sin datos suficientes no hay lectura', () => {
    expect(technicalTrend(series([1, 2]))).toBeNull();
    expect(technicalTrend(undefined)).toBeNull();
  });
  it('una serie que sube sostenidamente es alcista', () => {
    const up = series(Array.from({ length: 30 }, (_, i) => 100 + i * 2));
    const t = technicalTrend(up);
    expect(t.signal).toBe('alcista');
    expect(t.v1).toBeCloseTo(((158 / 156) - 1) * 100, 5);
    expect(t.v30).toBeCloseTo((158 / 100 - 1) * 100, 5);
    expect(t.text).toMatch(/alcista/);
  });
  it('una que baja es bajista; una plana, neutral', () => {
    expect(technicalTrend(series(Array.from({ length: 30 }, (_, i) => 200 - i * 3))).signal).toBe('bajista');
    const flat = technicalTrend(series(Array.from({ length: 30 }, () => 100)));
    expect(flat.signal).toBe('neutral');
    expect(flat.vol).toBe(0);
  });
  it('la volatilidad crece con las oscilaciones', () => {
    const calm = technicalTrend(series(Array.from({ length: 30 }, (_, i) => 100 + (i % 2)))).vol;
    const wild = technicalTrend(series(Array.from({ length: 30 }, (_, i) => 100 + (i % 2) * 20))).vol;
    expect(wild).toBeGreaterThan(calm);
  });
});

describe('catálogo de clases', () => {
  it('conoce cada clase y cae en divisas si no la reconoce', () => {
    expect(assetClassInfo('cripto').label).toBe('Criptoactivos');
    expect(assetClassInfo('accion').unitLabel).toBe('acciones');
    expect(assetClassInfo('otra').id).toBe('divisa');
  });
});

describe('portfolioAssets — el portafolio dentro del patrimonio', () => {
  const holdings = [{ id: 'usd', name: 'Dólares', ownerMemberId: 'me' }, { id: 'vacia', name: 'Sin operaciones', ownerMemberId: null }];
  const t = (id, date, side, units, cop, accountId = null) => ({ id, holdingId: 'usd', date, side, units, cop, accountId, createdAt: id });
  const trades = [t('a', '2026-01-10', 'compra', 100, 400000, 'acc'), t('b', '2026-03-10', 'venta', 40, 180000, null)];
  const prices = [{ holdingId: 'usd', date: '2026-02-01', priceCop: 4100 }, { holdingId: 'usd', date: '2026-04-01', priceCop: 4300 }];
  const assets = portfolioAssets(holdings, trades, prices);

  it('crea un activo por posición con operaciones y omite las vacías', () => {
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({ id: 'holding:usd', name: 'Dólares', kind: 'inversion', ownerMemberId: 'me', acquiredOn: '2026-01-10', status: 'activo' });
  });
  it('su valor a cada fecha son las unidades de ese día por el último precio conocido', () => {
    const at = (d) => assetValueAt(assets[0], assets[0].valuations, d).value;
    expect(at('2026-01-05')).toBe(0); // aún no existía
    expect(at('2026-01-15')).toBe(400000); // sin precio: a su costo
    expect(at('2026-02-15')).toBe(410000); // 100 × 4.100
    expect(at('2026-03-15')).toBe(246000); // 60 × 4.100
    expect(at('2026-04-15')).toBe(258000); // 60 × 4.300
  });
  it('solo las operaciones ligadas a una cuenta cuentan como dinero puesto o recibido', () => {
    expect(assets[0].flows).toEqual([{ date: '2026-01-10', amount: 400000 }]); // la venta no entró a ninguna cuenta
  });
  it('la valorización del período descuenta solo ese dinero puesto', () => {
    // enero: valor 0 → 400.000, y se pusieron 400.000 desde una cuenta → valorización 0
    expect(assetRevaluation(assets[0], assets[0].valuations, '2026-01-01', '2026-01-31')).toBe(0);
    // febrero: 400.000 → 410.000 sin movimientos → +10.000
    expect(assetRevaluation(assets[0], assets[0].valuations, '2026-02-01', '2026-02-28')).toBe(10000);
    // marzo: 410.000 → 246.000, se vendió sin cuenta → −164.000 (sale como valorización negativa)
    expect(assetRevaluation(assets[0], assets[0].valuations, '2026-03-01', '2026-03-31')).toBe(-164000);
  });
  it('sin datos no falla', () => {
    expect(portfolioAssets(undefined, undefined, undefined)).toEqual([]);
  });
});

describe('allAssets', () => {
  it('une los bienes registrados con las posiciones de mercado', () => {
    expect(allAssets({ assets: [{ id: 1 }], marketAssets: [{ id: 2 }] })).toEqual([{ id: 1 }, { id: 2 }]);
    expect(allAssets({})).toEqual([]);
    expect(allAssets(undefined)).toEqual([]);
  });
});
