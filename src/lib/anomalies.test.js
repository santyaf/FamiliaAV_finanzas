import { describe, it, expect, beforeEach } from 'vitest';
import { detectAnomalies, describeAnomaly, normalizeText } from './anomalies';

const TODAY = '2026-06-15';
let n = 0;
beforeEach(() => { n = 0; });

const tx = (o = {}) => ({
  id: `t${++n}`, type: 'expense', amount: 100, description: '', categoryId: 'c1',
  accountId: 'a1', memberId: 'm1', date: '2026-06-10', recurring: false, ...o,
});
const detect = (list) => detectAnomalies(list, { today: TODAY });
const ofType = (list, type) => detect(list).filter((a) => a.type === type);

describe('normalizeText', () => {
  it('quita acentos, signos y espacios de más', () => {
    expect(normalizeText('Mercado  D1 —#12!')).toBe('mercado d1 12');
    expect(normalizeText('Café Ñandú')).toBe('cafe nandu');
    expect(normalizeText(null)).toBe('');
  });
});

describe('duplicados', () => {
  const base = { description: 'Almuerzo Crepes', amount: 45000 };

  it('marca el segundo de dos movimientos idénticos el mismo día, con severidad alta', () => {
    const list = [tx({ ...base }), tx({ ...base })];
    const found = ofType(list, 'duplicate');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ key: 'dup:t2', severity: 'high', txIds: ['t2', 't1'] });
  });

  it('a un día de diferencia es un duplicado probable (severidad media)', () => {
    const list = [tx({ ...base, date: '2026-06-09' }), tx({ ...base, date: '2026-06-10' })];
    expect(ofType(list, 'duplicate')[0].severity).toBe('medium');
  });

  it('el mismo día pero en otra cuenta baja a severidad media', () => {
    const list = [tx({ ...base }), tx({ ...base, accountId: 'a2' })];
    expect(ofType(list, 'duplicate')[0].severity).toBe('medium');
  });

  it('con 3 días de diferencia ya no cuenta', () => {
    const list = [tx({ ...base, date: '2026-06-06' }), tx({ ...base, date: '2026-06-09' })];
    expect(ofType(list, 'duplicate')).toHaveLength(0);
  });

  it('no marca si cambia el monto, el integrante o falta la descripción', () => {
    expect(ofType([tx({ ...base }), tx({ ...base, amount: 46000 })], 'duplicate')).toHaveLength(0);
    expect(ofType([tx({ ...base }), tx({ ...base, memberId: 'm2' })], 'duplicate')).toHaveLength(0);
    expect(ofType([tx({ amount: 45000 }), tx({ amount: 45000 })], 'duplicate')).toHaveLength(0);
  });

  it('ignora duplicados viejos (más de 30 días) y las plantillas recurrentes', () => {
    const viejos = [tx({ ...base, date: '2026-04-01' }), tx({ ...base, date: '2026-04-01' })];
    expect(ofType(viejos, 'duplicate')).toHaveLength(0);
    const recurrentes = [tx({ ...base, recurring: true }), tx({ ...base, recurring: true })];
    expect(ofType(recurrentes, 'duplicate')).toHaveLength(0);
  });

  it('con tres iguales marca el segundo y el tercero, cada uno contra el anterior', () => {
    const list = [tx({ ...base }), tx({ ...base }), tx({ ...base })];
    expect(ofType(list, 'duplicate').map((a) => a.key).sort()).toEqual(['dup:t2', 'dup:t3']);
  });
});

describe('monto inusual', () => {
  // 5 compras normales de la categoría, todas antes del gasto a evaluar
  const baseline = () => [90000, 100000, 110000, 95000, 105000].map((amount, i) =>
    tx({ amount, date: `2026-05-${String(1 + i * 5).padStart(2, '0')}` }));

  it('marca un gasto 5 veces más grande que lo normal con severidad alta', () => {
    const list = [...baseline(), tx({ amount: 500000, date: '2026-06-12' })];
    const found = ofType(list, 'unusual_amount');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'high', data: { amount: 500000, median: 100000 } });
  });

  it('un gasto 2.5 veces mayor es severidad media', () => {
    const list = [...baseline(), tx({ amount: 250000, date: '2026-06-12' })];
    expect(ofType(list, 'unusual_amount')[0].severity).toBe('medium');
  });

  it('no marca un gasto apenas por encima (menos del doble de lo normal)', () => {
    const list = [...baseline(), tx({ amount: 130000, date: '2026-06-12' })];
    expect(ofType(list, 'unusual_amount')).toHaveLength(0);
  });

  it('necesita al menos 5 gastos previos en la categoría para opinar', () => {
    const list = [...baseline().slice(0, 4), tx({ amount: 500000, date: '2026-06-12' })];
    expect(ofType(list, 'unusual_amount')).toHaveLength(0);
  });

  it('si todo lo previo es idéntico usa la regla de 3 veces el valor habitual', () => {
    const iguales = () => [1, 6, 11, 16, 21].map((d) => tx({ amount: 100000, date: `2026-05-${String(d).padStart(2, '0')}` }));
    expect(ofType([...iguales(), tx({ amount: 350000, date: '2026-06-12' })], 'unusual_amount')).toHaveLength(1);
    expect(ofType([...iguales(), tx({ amount: 250000, date: '2026-06-12' })], 'unusual_amount')).toHaveLength(0);
  });

  it('solo mira gastos recientes y solo compara dentro de su categoría', () => {
    const viejo = [...baseline().map((t) => ({ ...t, date: t.date.replace('2026-05', '2026-02') })), tx({ amount: 500000, date: '2026-04-20' })];
    expect(ofType(viejo, 'unusual_amount')).toHaveLength(0);
    const otraCategoria = [...baseline(), tx({ amount: 500000, date: '2026-06-12', categoryId: 'c2' })];
    expect(ofType(otraCategoria, 'unusual_amount')).toHaveLength(0);
  });
});

describe('subida de precio de un cobro mensual', () => {
  const serie = (amounts, dates = ['2026-04-12', '2026-05-12', '2026-06-12']) =>
    amounts.map((amount, i) => tx({ description: 'Netflix', categoryId: 'c2', amount, date: dates[i] }));

  it('detecta un cobro mensual estable que subió, con el porcentaje', () => {
    const found = ofType(serie([15000, 15000, 18000]), 'price_increase');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'medium', data: { previousAmount: 15000, newAmount: 18000, pct: 20 } });
  });

  it('una subida chica (≥5%) es severidad baja', () => {
    expect(ofType(serie([15000, 15000, 15900]), 'price_increase')[0].severity).toBe('low');
  });

  it('no marca si el precio no cambió, subió 3% o se duplicó de golpe', () => {
    expect(ofType(serie([15000, 15000, 15000]), 'price_increase')).toHaveLength(0);
    expect(ofType(serie([15000, 15000, 15450]), 'price_increase')).toHaveLength(0);
    expect(ofType(serie([15000, 15000, 40000]), 'price_increase')).toHaveLength(0);
  });

  it('exige una serie regular de 3 cobros (no 2, no espaciados al azar)', () => {
    expect(ofType(serie([15000, 18000], ['2026-05-12', '2026-06-12']), 'price_increase')).toHaveLength(0);
    expect(ofType(serie([15000, 15000, 18000], ['2026-05-20', '2026-06-01', '2026-06-12']), 'price_increase')).toHaveLength(0);
  });

  it('no avisa de cobros cuyo último pago ya es viejo', () => {
    expect(ofType(serie([15000, 15000, 18000], ['2026-02-12', '2026-03-12', '2026-04-12']), 'price_increase')).toHaveLength(0);
  });
});

describe('categoría disparada este mes', () => {
  // gasto de 100.000 en c1 y en c2 en cada uno de los 3 meses anteriores
  const historia = () => ['2026-03-10', '2026-04-10', '2026-05-10'].flatMap((date) => [
    tx({ amount: 100000, date, categoryId: 'c1' }), tx({ amount: 100000, date, categoryId: 'c2' }),
  ]);

  it('marca la categoría cuando el mes ya va muy por encima de su promedio', () => {
    const found = ofType([...historia(), tx({ amount: 300000, date: '2026-06-05', categoryId: 'c1' })], 'category_spike');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ key: 'spike:c1:2026-06', severity: 'high', data: { categoryId: 'c1', current: 300000, average: 100000 } });
  });

  it('1.5x–2.5x del promedio es severidad media', () => {
    const found = ofType([...historia(), tx({ amount: 200000, date: '2026-06-05', categoryId: 'c1' })], 'category_spike');
    expect(found[0].severity).toBe('medium');
  });

  it('no marca si el mes va dentro de lo normal', () => {
    expect(ofType([...historia(), tx({ amount: 140000, date: '2026-06-05', categoryId: 'c1' })], 'category_spike')).toHaveLength(0);
  });

  it('necesita al menos 2 meses previos con gasto en la categoría', () => {
    const poca = [tx({ amount: 100000, date: '2026-05-10', categoryId: 'c1' }), tx({ amount: 100000, date: '2026-05-11', categoryId: 'c2' }),
      tx({ amount: 100000, date: '2026-04-10', categoryId: 'c2' }), tx({ amount: 900000, date: '2026-06-05', categoryId: 'c1' })];
    expect(ofType(poca, 'category_spike')).toHaveLength(0);
  });
});

describe('muchos cobros periódicos en una categoría', () => {
  const serieMensual = (description) => ['2026-04-10', '2026-05-10', '2026-06-10']
    .map((date) => tx({ description, categoryId: 'ent', amount: 10000, date }));

  it('avisa cuando hay 4 o más cobros que se repiten cada mes en la misma categoría', () => {
    const list = ['Netflix', 'Spotify', 'Disney', 'HBO'].flatMap(serieMensual);
    const found = ofType(list, 'many_subscriptions');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ key: 'subs:ent:4', severity: 'low', data: { categoryId: 'ent', count: 4, monthlyTotal: 40000 } });
  });

  it('con 3 no avisa', () => {
    expect(ofType(['Netflix', 'Spotify', 'Disney'].flatMap(serieMensual), 'many_subscriptions')).toHaveLength(0);
  });

  it('cuenta también las recurrentes mensuales, sin contar dos veces la misma', () => {
    const list = [
      ...serieMensual('Netflix'), ...serieMensual('Spotify'),
      tx({ description: 'Disney', categoryId: 'ent', amount: 10000, recurring: true, frequency: 'mensual' }),
      tx({ description: 'HBO', categoryId: 'ent', amount: 10000, recurring: true, frequency: 'mensual' }),
      tx({ description: 'Netflix', categoryId: 'ent', amount: 10000, recurring: true, frequency: 'mensual' }),
    ];
    expect(ofType(list, 'many_subscriptions')[0].data.count).toBe(4);
  });
});

describe('detectAnomalies (orden y combinación)', () => {
  it('ordena por severidad: lo grave primero', () => {
    const list = [
      tx({ description: 'Almuerzo', amount: 45000 }), tx({ description: 'Almuerzo', amount: 45000 }),
      ...[15000, 15000, 18000].map((amount, i) => tx({ description: 'Netflix', categoryId: 'c2', amount, date: ['2026-04-12', '2026-05-12', '2026-06-12'][i] })),
    ];
    expect(detect(list).map((a) => a.type)).toEqual(['duplicate', 'price_increase']);
  });

  it('sin movimientos o sin nada raro devuelve una lista vacía', () => {
    expect(detect([])).toEqual([]);
    expect(detect([tx({ description: 'Almuerzo', amount: 45000 })])).toEqual([]);
  });

  it('ignora ingresos, transferencias y gastos sin monto', () => {
    const list = [
      tx({ type: 'income', description: 'Nómina', amount: 900000 }), tx({ type: 'income', description: 'Nómina', amount: 900000 }),
      tx({ type: 'transfer', description: 'A ahorros', amount: 50000 }), tx({ type: 'transfer', description: 'A ahorros', amount: 50000 }),
    ];
    expect(detect(list)).toEqual([]);
  });
});

describe('describeAnomaly', () => {
  const fmt = {
    formatMoney: (v) => `$${v}`,
    formatDate: (d) => d,
    categoryName: () => 'Mercado',
  };
  const describe1 = (type, data) => describeAnomaly({ type, data }, fmt);

  it('duplicado: mismo día vs días distintos', () => {
    const mismo = describe1('duplicate', { description: 'Almuerzo', amount: 45000, date: '2026-06-10', previousDate: '2026-06-10' });
    expect(mismo.title).toBe('Posible movimiento duplicado');
    expect(mismo.detail).toBe('"Almuerzo" por $45000 aparece dos veces el 2026-06-10.');
    const distinto = describe1('duplicate', { description: 'Almuerzo', amount: 45000, date: '2026-06-10', previousDate: '2026-06-09' });
    expect(distinto.detail).toBe('"Almuerzo" por $45000 aparece dos veces (2026-06-09 y 2026-06-10).');
  });

  it('gasto inusual', () => {
    const d = describe1('unusual_amount', { amount: 500000, median: 100000, categoryId: 'c1', description: 'Feria' });
    expect(d.title).toBe('Gasto inusual');
    expect(d.detail).toBe('$500000 en "Feria" (Mercado) — lo normal en esa categoría ronda $100000.');
  });

  it('subida de precio', () => {
    const d = describe1('price_increase', { description: 'Netflix', previousAmount: 15000, newAmount: 18000, pct: 20 });
    expect(d.detail).toBe('"Netflix" pasó de $15000 a $18000 (+20%).');
  });

  it('categoría disparada y cobros periódicos', () => {
    expect(describe1('category_spike', { categoryId: 'c1', current: 300000, average: 100000 }).title).toBe('Gasto alto en Mercado este mes');
    const subs = describe1('many_subscriptions', { categoryId: 'c1', count: 4, monthlyTotal: 40000 });
    expect(subs.title).toBe('4 cobros que se repiten cada mes en Mercado');
    expect(subs.detail).toContain('$40000 al mes');
  });

  it('un tipo desconocido no rompe', () => {
    expect(describe1('otro', {}).title).toBe('Para revisar');
  });
});
