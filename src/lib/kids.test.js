import { describe, it, expect } from 'vitest';
import {
  nextAllowanceDate, dueAllowanceDates, kidBalance, goalProgress, goalsToCelebrate, ageLabel, kidSummary, ledgerWithBalance,
  validateLedgerEntry, hasAllowance, LEDGER_KINDS, ALLOWANCE_FREQUENCIES,
} from './kids';

describe('nextAllowanceDate', () => {
  it('semanal y quincenal suman 7 y 14 días', () => {
    expect(nextAllowanceDate('2026-09-21', 'semanal')).toBe('2026-09-28');
    expect(nextAllowanceDate('2026-09-21', 'quincenal')).toBe('2026-10-05');
  });
  it('mensual conserva el día', () => {
    expect(nextAllowanceDate('2026-09-15', 'mensual')).toBe('2026-10-15');
    expect(nextAllowanceDate('2026-12-10', 'mensual')).toBe('2027-01-10');
  });
  it('mensual no desborda el mes corto (31 de enero → 28 de febrero)', () => {
    expect(nextAllowanceDate('2026-01-31', 'mensual')).toBe('2026-02-28');
    expect(nextAllowanceDate('2028-01-31', 'mensual')).toBe('2028-02-29'); // bisiesto
    expect(nextAllowanceDate('2026-03-31', 'mensual')).toBe('2026-04-30');
  });
});

describe('dueAllowanceDates', () => {
  const kid = { allowanceAmount: 20000, allowanceFrequency: 'semanal', allowanceNextDate: '2026-09-07' };
  it('lista todas las mesadas vencidas hasta hoy, en orden', () => {
    expect(dueAllowanceDates(kid, '2026-09-21')).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });
  it('si aún no toca, no hay nada', () => {
    expect(dueAllowanceDates(kid, '2026-09-06')).toEqual([]);
  });
  it('sin mesada configurada o archivado, nada', () => {
    expect(dueAllowanceDates({ ...kid, allowanceAmount: null }, '2026-12-01')).toEqual([]);
    expect(dueAllowanceDates({ ...kid, archived: true }, '2026-12-01')).toEqual([]);
    expect(hasAllowance({})).toBe(false);
    expect(hasAllowance(kid)).toBe(true);
  });
  it('un atraso de años no paga de más (tope)', () => {
    expect(dueAllowanceDates({ ...kid, allowanceNextDate: '2020-01-01' }, '2026-09-21')).toHaveLength(12);
    expect(dueAllowanceDates({ ...kid, allowanceNextDate: '2020-01-01' }, '2026-09-21', 3)).toHaveLength(3);
  });
});

describe('alcancía', () => {
  const entries = [
    { id: 'a', amount: 20000, kind: 'mesada', date: '2026-09-07', createdAt: '1' },
    { id: 'b', amount: 50000, kind: 'regalo', date: '2026-09-10', createdAt: '2' },
    { id: 'c', amount: -15000, kind: 'gasto', date: '2026-09-12', createdAt: '3' },
    { id: 'd', amount: 20000, kind: 'mesada', date: '2026-09-14', createdAt: '4' },
  ];
  it('el saldo es la suma de sus movimientos', () => { expect(kidBalance(entries)).toBe(75000); expect(kidBalance([])).toBe(0); expect(kidBalance(undefined)).toBe(0); });
  it('el libro muestra lo más reciente primero con el saldo después de cada uno', () => {
    const rows = ledgerWithBalance(entries);
    expect(rows.map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(rows.map((r) => r.balanceAfter)).toEqual([75000, 55000, 70000, 20000]);
  });
  it('el resumen separa lo que entró y lo que salió', () => {
    const kid = { allowanceAmount: 20000, allowanceFrequency: 'semanal', allowanceNextDate: '2026-09-21', birthDate: '2018-05-10' };
    const s = kidSummary(kid, entries, '2026-09-21');
    expect(s).toMatchObject({ balance: 75000, inflow: 90000, outflow: 15000, age: '8 años' });
    expect(s.nextAllowance).toMatchObject({ date: '2026-09-21', amount: 20000, overdue: false });
    expect(kidSummary({ ...kid, allowanceNextDate: '2026-09-14' }, entries, '2026-09-21').nextAllowance.overdue).toBe(true);
    expect(kidSummary({}, [], '2026-09-21').nextAllowance).toBeNull();
  });
});

describe('metas', () => {
  const goal = { id: 'g', name: 'Bicicleta', targetAmount: 400000, achievedAt: null };
  it('avance, falta y logro', () => {
    expect(goalProgress(goal, 100000)).toEqual({ pct: 25, remaining: 300000, reached: false });
    expect(goalProgress(goal, 400000)).toEqual({ pct: 100, remaining: 0, reached: true });
    expect(goalProgress(goal, 900000).pct).toBe(100);
    expect(goalProgress(goal, -5).pct).toBe(0);
  });
  it('celebra las alcanzadas que aún no se compraron', () => {
    const goals = [goal, { id: 'h', name: 'Libro', targetAmount: 30000, achievedAt: null }, { id: 'i', name: 'Ya', targetAmount: 10000, achievedAt: '2026-09-01' }];
    expect(goalsToCelebrate(goals, 50000).map((g) => g.id)).toEqual(['h']);
    expect(goalsToCelebrate(goals, 500000).map((g) => g.id)).toEqual(['g', 'h']);
  });
});

describe('edad y validación', () => {
  it('meses hasta los 2 años y años después', () => {
    expect(ageLabel('2026-08-10', '2026-09-21')).toBe('1 mes');
    expect(ageLabel('2025-01-01', '2026-09-21')).toBe('20 meses');
    expect(ageLabel('2016-09-22', '2026-09-21')).toBe('9 años');
    expect(ageLabel('2016-09-21', '2026-09-21')).toBe('10 años');
    expect(ageLabel(null, '2026-09-21')).toBe('');
    expect(ageLabel('2030-01-01', '2026-09-21')).toBe('');
  });
  it('un gasto no puede dejar la alcancía en negativo', () => {
    expect(validateLedgerEntry({ kind: 'gasto', amount: 5000, balance: 3000 })).toMatch(/no tiene tanto/);
    expect(validateLedgerEntry({ kind: 'gasto', amount: 3000, balance: 3000 })).toBe('');
    expect(validateLedgerEntry({ kind: 'regalo', amount: 5000, balance: 0 })).toBe('');
    expect(validateLedgerEntry({ kind: 'regalo', amount: 0, balance: 0 })).toMatch(/mayor que cero/);
    expect(validateLedgerEntry({ kind: 'otro', amount: 5, balance: 0 })).toMatch(/tipo/);
  });
  it('tipos y frecuencias definidos', () => {
    expect(Object.keys(LEDGER_KINDS)).toContain('compra_meta');
    expect(ALLOWANCE_FREQUENCIES.map((f) => f.id)).toEqual(['semanal', 'quincenal', 'mensual']);
  });
});
