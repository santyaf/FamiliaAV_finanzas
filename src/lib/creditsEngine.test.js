import { describe, it, expect } from 'vitest';
import {
  addMonths, RATE_TYPES, toEffectiveAnnual, fromEffectiveAnnual, annualToMonthlyRate,
  generateSchedule, recalcAfterExtraPayment, summarizeSchedule, buildRefinance,
} from './amortization';

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);

describe('addMonths', () => {
  it('suma meses conservando el día', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
  it('si el día no existe queda en el último del mes (no se pasa al siguiente)', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-05-31', 4)).toBe('2026-09-30');
  });
  it('no acumula error: siempre se calcula desde la fecha base', () => {
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-01-31', 12)).toBe('2027-01-31');
  });
  it('cruza el cambio de año y funciona con n negativo o cero', () => {
    expect(addMonths('2026-12-10', 1)).toBe('2027-01-10');
    expect(addMonths('2026-03-10', -3)).toBe('2025-12-10');
    expect(addMonths('2026-03-10', 0)).toBe('2026-03-10');
  });
});

describe('tipos de tasa', () => {
  it('E.A. se queda igual', () => {
    expect(toEffectiveAnnual(24.5, 'EA')).toBe(24.5);
    expect(toEffectiveAnnual(24.5)).toBe(24.5);
  });
  it('efectiva mensual → E.A.', () => {
    expect(round(toEffectiveAnnual(2, 'EM'), 4)).toBe(26.8242);
    expect(round(toEffectiveAnnual(1.5, 'EM'), 4)).toBe(19.5618);
  });
  it('nominal anual mes vencido → E.A.', () => {
    expect(round(toEffectiveAnnual(24, 'NMV'), 4)).toBe(26.8242); // 24%/12 = 2% mensual
  });
  it('la conversión de vuelta recupera lo que dijo el banco', () => {
    expect(round(fromEffectiveAnnual(toEffectiveAnnual(1.8, 'EM'), 'EM'), 6)).toBe(1.8);
    expect(round(fromEffectiveAnnual(toEffectiveAnnual(21.6, 'NMV'), 'NMV'), 6)).toBe(21.6);
    expect(fromEffectiveAnnual(19, 'EA')).toBe(19);
  });
  it('una tasa mensual del 2% da una cuota mensual con interés del 2% sobre el saldo', () => {
    const ea = toEffectiveAnnual(2, 'EM');
    expect(round(annualToMonthlyRate(ea), 6)).toBe(0.02);
  });
  it('expone los tres tipos', () => {
    expect(RATE_TYPES.map((t) => t.id)).toEqual(['EA', 'EM', 'NMV']);
  });
});

describe('generateSchedule — vencimientos', () => {
  const base = { principal: 1_200_000, annualRate: 20, termMonths: 4, system: 'frances', insuranceMonthly: 0 };

  it('sin firstDueDate: la primera cuota vence un mes después del inicio', () => {
    expect(generateSchedule({ ...base, startDate: '2026-01-15' }).map((r) => r.dueDate))
      .toEqual(['2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15']);
  });
  it('con firstDueDate (día de nómina) las cuotas conservan ese día', () => {
    expect(generateSchedule({ ...base, startDate: '2026-01-10', firstDueDate: '2026-01-31' }).map((r) => r.dueDate))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('un crédito iniciado el día 31 no se corre de mes', () => {
    const rows = generateSchedule({ ...base, startDate: '2026-01-31' });
    expect(rows.map((r) => r.dueDate)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });
  it('el capital de todas las cuotas suma el monto del crédito', () => {
    expect(round(sum(generateSchedule({ ...base, startDate: '2026-01-15' }), 'capital'), 2)).toBe(1_200_000);
  });
});

describe('recalcAfterExtraPayment — con firstDueDate', () => {
  it('conserva el vencimiento real de la próxima cuota (no lo corre a fecha del abono + 1 mes)', () => {
    const rows = recalcAfterExtraPayment({
      currentBalance: 1_000_000, extraAmount: 200_000, strategy: 'reducir_cuota', annualRate: 20, system: 'frances',
      remainingMonths: 4, insuranceMonthly: 0, fromDate: '2026-03-20', firstDueDate: '2026-04-05', nextInstallmentNumber: 5,
    });
    expect(rows[0].dueDate).toBe('2026-04-05');
    expect(rows[1].dueDate).toBe('2026-05-05');
    expect(rows[0].installmentNumber).toBe(5);
  });
  it('reducir plazo también respeta firstDueDate', () => {
    const rows = recalcAfterExtraPayment({
      currentBalance: 1_000_000, extraAmount: 200_000, strategy: 'reducir_plazo', annualRate: 20, system: 'frances',
      remainingMonths: 6, insuranceMonthly: 0, fromDate: '2026-03-20', firstDueDate: '2026-04-05', nextInstallmentNumber: 1,
    });
    expect(rows[0].dueDate).toBe('2026-04-05');
    expect(rows.length).toBeLessThan(6);
  });
});

describe('summarizeSchedule', () => {
  it('resume cuotas, intereses, seguros y fecha final', () => {
    const rows = generateSchedule({ principal: 1_000_000, annualRate: 18, termMonths: 12, system: 'frances', insuranceMonthly: 5_000, startDate: '2026-01-15' });
    const s = summarizeSchedule(rows);
    expect(s.count).toBe(12);
    expect(s.lastDueDate).toBe('2027-01-15');
    expect(s.totalInsurance).toBe(60_000);
    expect(round(s.totalPaid, 2)).toBe(round(1_000_000 + s.totalInterest + 60_000, 2));
    expect(s.firstTotal).toBe(round(rows[0].total));
  });
  it('un calendario vacío resume en ceros', () => {
    expect(summarizeSchedule([])).toEqual({ count: 0, firstTotal: 0, lastDueDate: null, totalInterest: 0, totalInsurance: 0, totalPaid: 0 });
  });
});

describe('buildRefinance (retanqueo / rediferido)', () => {
  const common = { annualRate: 20, system: 'frances', insuranceMonthly: 0, firstDueDate: '2026-07-05', nextInstallmentNumber: 7 };

  it('retanqueo: el saldo nuevo es el actual más el dinero nuevo, y se amortiza completo', () => {
    const r = buildRefinance({ ...common, currentBalance: 5_000_000, topUp: 3_000_000, termMonths: 24 });
    expect(r.newBalance).toBe(8_000_000);
    expect(r.rows).toHaveLength(24);
    expect(r.rows[0]).toMatchObject({ installmentNumber: 7, dueDate: '2026-07-05' });
    expect(round(sum(r.rows, 'capital'), 2)).toBe(8_000_000);
    expect(r.rows[23].balanceAfter).toBeCloseTo(0, 2);
  });

  it('retanquear al mismo plazo y tasa sube la cuota; alargar el plazo la baja', () => {
    const before = buildRefinance({ ...common, currentBalance: 5_000_000, termMonths: 12 });
    const same = buildRefinance({ ...common, currentBalance: 5_000_000, topUp: 3_000_000, termMonths: 12 });
    const longer = buildRefinance({ ...common, currentBalance: 5_000_000, topUp: 3_000_000, termMonths: 36 });
    expect(same.summary.firstTotal).toBeGreaterThan(before.summary.firstTotal);
    expect(longer.summary.firstTotal).toBeLessThan(same.summary.firstTotal);
    expect(longer.summary.totalInterest).toBeGreaterThan(same.summary.totalInterest);
  });

  it('rediferido: sin dinero nuevo, alargar el plazo baja la cuota y sube los intereses totales', () => {
    const current = buildRefinance({ ...common, currentBalance: 6_000_000, termMonths: 12 });
    const rediferred = buildRefinance({ ...common, currentBalance: 6_000_000, termMonths: 24 });
    expect(rediferred.newBalance).toBe(6_000_000);
    expect(rediferred.summary.firstTotal).toBeLessThan(current.summary.firstTotal);
    expect(rediferred.summary.totalInterest).toBeGreaterThan(current.summary.totalInterest);
  });

  it('cambiar la tasa cambia la cuota: una tasa menor la baja', () => {
    const high = buildRefinance({ ...common, currentBalance: 6_000_000, termMonths: 12, annualRate: 28 });
    const low = buildRefinance({ ...common, currentBalance: 6_000_000, termMonths: 12, annualRate: 14 });
    expect(low.summary.firstTotal).toBeLessThan(high.summary.firstTotal);
  });

  it('respeta el seguro y el sistema alemán', () => {
    const r = buildRefinance({ ...common, currentBalance: 1_200_000, termMonths: 12, system: 'aleman', insuranceMonthly: 10_000 });
    expect(r.rows[0].capital).toBeCloseTo(100_000, 2);
    expect(r.rows[0].insurance).toBe(10_000);
    expect(r.summary.totalInsurance).toBe(120_000);
  });

  it('un saldo de cero no genera cuotas', () => {
    const r = buildRefinance({ ...common, currentBalance: 0, termMonths: 12 });
    expect(r.rows).toEqual([]);
    expect(r.summary.count).toBe(0);
  });
});
