import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  monthKey, thisMonthKey, daysUntil, getNextOccurrence, occurrencesInMonth,
  computeIncomeShares, computeBalances, simplifyDebts, goalPriorityScore,
} from './finance';

// Fijamos "hoy" = 2026-06-15 para que las funciones que dependen de la fecha
// sean deterministas.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('monthKey / thisMonthKey', () => {
  it('recorta a AAAA-MM', () => {
    expect(monthKey('2026-03-21')).toBe('2026-03');
  });
  it('thisMonthKey usa la fecha actual', () => {
    expect(thisMonthKey()).toBe('2026-06');
  });
});

describe('daysUntil', () => {
  it('cuenta días hasta una fecha futura', () => {
    expect(daysUntil('2026-06-25')).toBe(10);
  });
  it('es negativo para fechas pasadas', () => {
    expect(daysUntil('2026-06-05')).toBe(-10);
  });
});

describe('getNextOccurrence', () => {
  it('deja la fecha si ya es futura', () => {
    expect(getNextOccurrence({ date: '2026-07-01', frequency: 'mensual' })).toBe('2026-07-01');
  });
  it('avanza mensualmente hasta la próxima ocurrencia', () => {
    expect(getNextOccurrence({ date: '2026-01-10', frequency: 'mensual' })).toBe('2026-07-10');
  });
  it('avanza semanalmente hasta alcanzar hoy o después', () => {
    // 06-01 → 06-08 → 06-15 (== hoy, el bucle se detiene)
    expect(getNextOccurrence({ date: '2026-06-01', frequency: 'semanal' })).toBe('2026-06-15');
  });
  it('avanza anualmente', () => {
    expect(getNextOccurrence({ date: '2024-03-01', frequency: 'anual' })).toBe('2027-03-01');
  });
});

describe('occurrencesInMonth', () => {
  it('no recurrente: 1 si cae en el mes, 0 si no', () => {
    expect(occurrencesInMonth({ recurring: false, date: '2026-06-03' }, '2026-06')).toBe(1);
    expect(occurrencesInMonth({ recurring: false, date: '2026-05-03' }, '2026-06')).toBe(0);
  });
  it('mensual = 1, quincenal = 2, semanal = 4', () => {
    const t = (f) => ({ recurring: true, date: '2026-01-01', frequency: f });
    expect(occurrencesInMonth(t('mensual'), '2026-06')).toBe(1);
    expect(occurrencesInMonth(t('quincenal'), '2026-06')).toBe(2);
    expect(occurrencesInMonth(t('semanal'), '2026-06')).toBe(4);
  });
  it('no cuenta meses anteriores al inicio', () => {
    expect(occurrencesInMonth({ recurring: true, date: '2026-08-01', frequency: 'mensual' }, '2026-06')).toBe(0);
  });
  it('anual solo cuenta en su mes de aniversario', () => {
    expect(occurrencesInMonth({ recurring: true, date: '2025-06-01', frequency: 'anual' }, '2026-06')).toBe(1);
    expect(occurrencesInMonth({ recurring: true, date: '2025-03-01', frequency: 'anual' }, '2026-06')).toBe(0);
  });
});

describe('computeIncomeShares', () => {
  it('reparte proporcional al ingreso de los últimos 3 meses', () => {
    const tx = [
      { type: 'income', memberId: 'a', amount: 3000, date: '2026-05-01' },
      { type: 'income', memberId: 'b', amount: 1000, date: '2026-05-01' },
    ];
    const shares = computeIncomeShares(tx, ['a', 'b']);
    expect(shares.a).toBe(75);
    expect(shares.b).toBe(25);
  });
  it('ignora ingresos de hace más de 3 meses', () => {
    const tx = [
      { type: 'income', memberId: 'a', amount: 5000, date: '2026-01-01' }, // fuera de ventana
      { type: 'income', memberId: 'b', amount: 1000, date: '2026-05-01' },
    ];
    const shares = computeIncomeShares(tx, ['a', 'b']);
    expect(shares.b).toBe(100);
  });
  it('sin ingresos → partes iguales', () => {
    const shares = computeIncomeShares([], ['a', 'b', 'c', 'd']);
    expect(shares).toEqual({ a: 25, b: 25, c: 25, d: 25 });
  });
});

describe('computeBalances', () => {
  const members = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('gasto compartido: el pagador queda acreedor por lo que pusieron los demás', () => {
    const tx = [{
      type: 'expense', isShared: true, memberId: 'a', amount: 300,
      participants: [{ memberId: 'a', share: 100 }, { memberId: 'b', share: 100 }, { memberId: 'c', share: 100 }],
    }];
    const bal = computeBalances(tx, members);
    expect(bal.a).toBe(200);
    expect(bal.b).toBe(-100);
    expect(bal.c).toBe(-100);
  });

  it('un settlement mueve el saldo entre las dos personas', () => {
    const tx = [{ type: 'settlement', from: 'b', to: 'a', amount: 100 }];
    const bal = computeBalances(tx, members);
    expect(bal.b).toBe(100);
    expect(bal.a).toBe(-100);
  });

  it('una transferencia que salda deuda cuenta como pago', () => {
    const tx = [{ type: 'transfer', memberId: 'b', toMemberId: 'a', amount: 50, settlesDebt: true }];
    const bal = computeBalances(tx, members);
    expect(bal.b).toBe(50);
    expect(bal.a).toBe(-50);
  });

  it('una transferencia a un objetivo NO afecta balances entre integrantes', () => {
    const tx = [{ type: 'transfer', memberId: 'b', goalId: 'g1', amount: 50 }];
    const bal = computeBalances(tx, members);
    expect(bal).toEqual({ a: 0, b: 0, c: 0 });
  });
});

describe('simplifyDebts', () => {
  it('convierte balances en el mínimo de transferencias', () => {
    const transfers = simplifyDebts({ a: 200, b: -100, c: -100 });
    expect(transfers).toHaveLength(2);
    const total = transfers.reduce((s, t) => s + t.amount, 0);
    expect(total).toBe(200);
    transfers.forEach((t) => expect(t.to).toBe('a'));
  });

  it('ignora saldos por debajo de 0.5', () => {
    expect(simplifyDebts({ a: 0.3, b: -0.3 })).toEqual([]);
  });

  it('cada deudor paga exactamente lo que debe', () => {
    const transfers = simplifyDebts({ a: 150, b: 50, c: -120, d: -80 });
    const paidByC = transfers.filter((t) => t.from === 'c').reduce((s, t) => s + t.amount, 0);
    expect(paidByC).toBe(120);
  });
});

describe('goalPriorityScore', () => {
  it('sin votos → prioridad media (2)', () => {
    expect(goalPriorityScore({})).toBe(2);
  });
  it('promedia los votos', () => {
    expect(goalPriorityScore({ votes: { a: 3, b: 3, c: 1 } })).toBeCloseTo(2.333, 2);
  });
});
