import { describe, it, expect } from 'vitest';
import { annualToMonthlyRate, generateSchedule, recalcAfterExtraPayment } from './amortization';

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);

describe('annualToMonthlyRate', () => {
  it('convierte una E.A. a efectiva mensual equivalente', () => {
    // (1 + i_m)^12 = 1 + i_a
    const im = annualToMonthlyRate(12);
    expect(round((1 + im) ** 12 - 1, 6)).toBe(0.12);
  });
  it('0% anual → 0% mensual', () => {
    expect(annualToMonthlyRate(0)).toBe(0);
  });
});

describe('generateSchedule — sistema francés', () => {
  const rows = generateSchedule({
    principal: 12_000_000, annualRate: 18, termMonths: 24, system: 'frances',
    insuranceMonthly: 15_000, startDate: '2026-01-15',
  });

  it('genera una fila por cada mes del plazo', () => {
    expect(rows).toHaveLength(24);
    expect(rows[0].installmentNumber).toBe(1);
    expect(rows[23].installmentNumber).toBe(24);
  });

  it('el saldo termina en 0 (± centavos)', () => {
    expect(round(rows[23].balanceAfter)).toBe(0);
  });

  it('la suma de capital de todas las cuotas es igual al principal', () => {
    expect(round(sum(rows, 'capital'))).toBe(12_000_000);
  });

  it('la cuota (capital + interés) es aproximadamente fija', () => {
    const cuota = (r) => r.capital + r.interest;
    const first = cuota(rows[0]);
    const mid = cuota(rows[10]);
    expect(Math.abs(first - mid) / first).toBeLessThan(0.01);
  });

  it('el primer interés = saldo inicial * tasa mensual', () => {
    const i = annualToMonthlyRate(18);
    expect(round(rows[0].interest)).toBe(round(12_000_000 * i));
  });

  it('el total incluye el seguro', () => {
    expect(round(rows[0].total)).toBe(round(rows[0].capital + rows[0].interest + 15_000));
  });

  it('las fechas de pago avanzan mes a mes desde startDate', () => {
    expect(rows[0].dueDate).toBe('2026-02-15');
    expect(rows[1].dueDate).toBe('2026-03-15');
    expect(rows[11].dueDate).toBe('2027-01-15');
  });
});

describe('generateSchedule — sistema alemán', () => {
  const rows = generateSchedule({
    principal: 10_000_000, annualRate: 12, termMonths: 10, system: 'aleman',
    insuranceMonthly: 0, startDate: '2026-01-01',
  });

  it('el abono a capital es fijo (principal / plazo)', () => {
    rows.forEach((r) => expect(round(r.capital)).toBe(1_000_000));
  });

  it('el interés decrece cada mes', () => {
    for (let n = 1; n < rows.length; n++) {
      expect(rows[n].interest).toBeLessThan(rows[n - 1].interest);
    }
  });

  it('el saldo termina en 0', () => {
    expect(round(rows[9].balanceAfter)).toBe(0);
  });
});

describe('generateSchedule — 0% de interés', () => {
  it('reparte el principal en cuotas iguales sin interés', () => {
    const rows = generateSchedule({
      principal: 6000, annualRate: 0, termMonths: 6, system: 'frances',
      insuranceMonthly: 0, startDate: '2026-01-01',
    });
    expect(sum(rows, 'interest')).toBe(0);
    rows.forEach((r) => expect(round(r.capital)).toBe(1000));
  });
});

describe('recalcAfterExtraPayment', () => {
  const base = {
    currentBalance: 10_000_000, annualRate: 18, system: 'frances',
    remainingMonths: 20, insuranceMonthly: 0, fromDate: '2026-06-01', nextInstallmentNumber: 5,
  };

  it('reducir_cuota: mantiene el plazo restante, baja la cuota', () => {
    const rows = recalcAfterExtraPayment({ ...base, extraAmount: 2_000_000, strategy: 'reducir_cuota' });
    expect(rows).toHaveLength(20);
    expect(round(sum(rows, 'capital'))).toBe(8_000_000);
    expect(rows[0].installmentNumber).toBe(5);
  });

  it('reducir_plazo: acorta el número de cuotas, mantiene la cuota original', () => {
    const rows = recalcAfterExtraPayment({ ...base, extraAmount: 2_000_000, strategy: 'reducir_plazo' });
    expect(rows.length).toBeLessThan(20);
    expect(rows.length).toBeGreaterThan(0);
    expect(round(sum(rows, 'capital'), 0)).toBe(8_000_000);
  });

  it('si el abono cancela el saldo, no quedan cuotas', () => {
    const rows = recalcAfterExtraPayment({ ...base, extraAmount: 10_000_000, strategy: 'reducir_plazo' });
    expect(rows).toEqual([]);
  });
});
