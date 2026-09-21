import { describe, it, expect } from 'vitest';
import { debtsFromCredits, simulatePayoff, compareStrategies } from './debtStrategy';
import { generateSchedule } from './amortization';

// dos deudas: una grande y barata, una pequeña y cara
const A = { id: 'a', name: 'Hipoteca', balance: 10000000, annualRate: 12, minPayment: 250000 };
const B = { id: 'b', name: 'Tarjeta', balance: 2000000, annualRate: 36, minPayment: 100000 };

describe('simulatePayoff', () => {
  it('solo mínimos: cada crédito se paga con su cuota, sin reasignar', () => {
    const r = simulatePayoff([A, B], { strategy: 'minimos' });
    expect(r.finished).toBe(true);
    const solo = (d) => simulatePayoff([d], { strategy: 'minimos' });
    expect(r.months).toBe(Math.max(solo(A).months, solo(B).months));
    expect(r.totalInterest).toBeCloseTo(solo(A).totalInterest + solo(B).totalInterest, 1);
  });

  it('coincide con la tabla de amortización de un crédito (mismos meses e intereses)', () => {
    const rows = generateSchedule({ principal: 5000000, annualRate: 18, termMonths: 24, system: 'frances', insuranceMonthly: 0, startDate: '2026-01-01' });
    const cuota = rows[0].capital + rows[0].interest;
    const r = simulatePayoff([{ id: 'x', name: 'X', balance: 5000000, annualRate: 18, minPayment: cuota }], { strategy: 'minimos' });
    expect(r.months).toBe(24);
    expect(r.totalInterest).toBeCloseTo(rows.reduce((s, x) => s + x.interest, 0), 0);
  });

  it('un extra acorta el plazo y baja los intereses', () => {
    const base = simulatePayoff([A, B], { strategy: 'minimos' });
    const con = simulatePayoff([A, B], { extra: 300000, strategy: 'avalancha' });
    expect(con.months).toBeLessThan(base.months);
    expect(con.totalInterest).toBeLessThan(base.totalInterest);
  });

  it('la avalancha ataca primero la de mayor tasa; la bola de nieve, la de menor saldo', () => {
    // B es la de mayor tasa y también la de menor saldo: para separarlas se hace la pequeña barata
    const chica = { id: 'c', name: 'Chica', balance: 500000, annualRate: 10, minPayment: 50000 };
    const cara = { id: 'd', name: 'Cara', balance: 4000000, annualRate: 40, minPayment: 150000 };
    const av = simulatePayoff([chica, cara], { extra: 200000, strategy: 'avalancha' });
    const bn = simulatePayoff([chica, cara], { extra: 200000, strategy: 'bola_de_nieve' });
    expect(bn.payoffs[0].id).toBe('c'); // la pequeña primero
    expect(av.totalInterest).toBeLessThan(bn.totalInterest); // pero la avalancha paga menos
  });

  it('lo que liberan los créditos ya pagados se reasigna a los demás', () => {
    const sin = simulatePayoff([A, B], { strategy: 'minimos' });
    const rueda = simulatePayoff([A, B], { extra: 0, strategy: 'avalancha' });
    expect(rueda.months).toBeLessThan(sin.months);
  });

  it('si la cuota no alcanza ni para los intereses, no termina y lo dice', () => {
    const r = simulatePayoff([{ id: 'z', name: 'Z', balance: 1000000, annualRate: 60, minPayment: 10000 }], { strategy: 'minimos', maxMonths: 120 });
    expect(r.finished).toBe(false);
    expect(r.months).toBeNull();
  });

  it('sin deudas termina en cero meses', () => {
    expect(simulatePayoff([], { extra: 100 }).finished).toBe(true);
  });
});

describe('compareStrategies', () => {
  it('compara ambas contra los mínimos e indica la que paga menos intereses', () => {
    const chica = { id: 'c', name: 'Chica', balance: 500000, annualRate: 10, minPayment: 50000 };
    const cara = { id: 'd', name: 'Cara', balance: 4000000, annualRate: 40, minPayment: 150000 };
    const cmp = compareStrategies([chica, cara], 200000);
    expect(cmp.avalancha.interestSaved).toBeGreaterThan(cmp.bola_de_nieve.interestSaved);
    expect(cmp.avalancha.monthsSaved).toBeGreaterThan(0);
    expect(cmp.best).toBe('avalancha');
  });
  it('si los mínimos nunca alcanzan, no calcula ahorros', () => {
    const cmp = compareStrategies([{ id: 'z', name: 'Z', balance: 1000000, annualRate: 60, minPayment: 10000 }], 0);
    expect(cmp.avalancha.interestSaved).toBeNull();
  });
});

describe('debtsFromCredits', () => {
  const mk = (id, over = {}, pay = {}) => ({
    credit: { id, name: id, currency: 'COP', annualRate: 20, principal: 1000000, status: 'activo', ...over },
    payments: [
      { installmentNumber: 1, paid: true, capital: 10, interest: 5, balanceAfter: 900000 },
      { installmentNumber: 2, paid: false, capital: 100000, interest: 15000, balanceAfter: 800000, ...pay },
    ],
  });
  it('toma el saldo y la cuota (capital + interés) de la próxima cuota sin pagar', () => {
    const d = debtsFromCredits([mk('k1')], 'COP');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ id: 'k1', annualRate: 20, minPayment: 115000 });
    expect(d[0].balance).toBe(900000);
  });
  it('excluye créditos pagados, en otra moneda y sin cuotas pendientes', () => {
    const d = debtsFromCredits([mk('k1', { status: 'pagado' }), mk('k2', { currency: 'UVR' }), { credit: { id: 'k3', currency: 'COP', principal: 500, status: 'activo' }, payments: [] }], 'COP');
    expect(d).toEqual([]);
  });
});
