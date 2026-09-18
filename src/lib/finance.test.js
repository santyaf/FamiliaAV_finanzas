import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  monthKey, thisMonthKey, daysUntil, getNextOccurrence, occurrencesInMonth,
  computeIncomeShares, computeBalances, simplifyDebts, goalPriorityScore, advanceByFrequency,
  accountBalance, creditOutstandingBalance, lastMonthKeys, monthCashFlow, daysLeftInMonth,
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

describe('advanceByFrequency', () => {
  it('semanal suma 7 días', () => {
    expect(advanceByFrequency('2026-06-01', 'semanal')).toBe('2026-06-08');
  });
  it('quincenal suma 14 días', () => {
    expect(advanceByFrequency('2026-06-01', 'quincenal')).toBe('2026-06-15');
  });
  it('mensual suma 1 mes (por defecto)', () => {
    expect(advanceByFrequency('2026-06-01', 'mensual')).toBe('2026-07-01');
    expect(advanceByFrequency('2026-06-01', undefined)).toBe('2026-07-01');
  });
  it('anual suma 1 año', () => {
    expect(advanceByFrequency('2026-06-01', 'anual')).toBe('2027-06-01');
  });
  it('mensual: día 31 cae al mes con menos días (comportamiento de setUTCMonth)', () => {
    expect(advanceByFrequency('2026-01-31', 'mensual')).toBe('2026-03-03');
  });
});

describe('accountBalance', () => {
  const acc = 'a1', other = 'a2';
  it('suma ingresos y resta gastos de la cuenta', () => {
    const txs = [
      { type: 'income', accountId: acc, amount: 1000 },
      { type: 'expense', accountId: acc, amount: 300 },
      { type: 'income', accountId: other, amount: 5000 }, // no cuenta, es de otra cuenta
    ];
    expect(accountBalance(txs, acc)).toBe(700);
  });
  it('aporte a objetivo (deposit) resta de la cuenta de origen; retiro (withdraw) suma', () => {
    const txs = [
      { type: 'transfer', goalId: 'g1', accountId: acc, transferDirection: 'deposit', amount: 200 },
      { type: 'transfer', goalId: 'g1', accountId: acc, transferDirection: 'withdraw', amount: 50 },
    ];
    expect(accountBalance(txs, acc)).toBe(-150);
  });
  it('transferencia entre integrantes: sale de la cuenta origen, entra a la de destino', () => {
    const txs = [{ type: 'transfer', accountId: acc, toAccountId: other, amount: 100 }];
    expect(accountBalance(txs, acc)).toBe(-100);
    expect(accountBalance(txs, other)).toBe(100);
  });
});

describe('creditOutstandingBalance', () => {
  it('sin cuotas pagadas: el saldo es el capital inicial', () => {
    expect(creditOutstandingBalance({ principal: 10000 }, [])).toBe(10000);
    expect(creditOutstandingBalance({ principal: 10000 }, null)).toBe(10000);
  });
  it('con cuotas pagadas: el saldo es el balanceAfter de la última pagada', () => {
    const payments = [
      { paid: true, balanceAfter: 9000 },
      { paid: true, balanceAfter: 8000 },
      { paid: false, balanceAfter: 7000 },
    ];
    expect(creditOutstandingBalance({ principal: 10000 }, payments)).toBe(8000);
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

describe('lastMonthKeys', () => {
  it('devuelve n meses en orden cronológico, terminando en el actual', () => {
    // "hoy" está fijado en 2026-06-15
    expect(lastMonthKeys(3)).toEqual(['2026-04', '2026-05', '2026-06']);
  });
  it('cruza el cambio de año correctamente', () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    expect(lastMonthKeys(3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
  it('n=1 devuelve solo el mes actual', () => {
    expect(lastMonthKeys(1)).toEqual(['2026-06']);
  });
});

describe('daysLeftInMonth', () => {
  it('cuenta hoy y los días que faltan del mes', () => {
    // "hoy" está fijado en 2026-06-15, junio tiene 30 días
    expect(daysLeftInMonth()).toBe(16);
  });
  it('el último día del mes devuelve 1', () => {
    vi.setSystemTime(new Date('2026-06-30T12:00:00Z'));
    expect(daysLeftInMonth()).toBe(1);
  });
  it('funciona en febrero (mes corto)', () => {
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
    expect(daysLeftInMonth()).toBe(28);
  });
});

describe('monthCashFlow', () => {
  it('suma ingresos y gastos del mes, separados', () => {
    const tx = [
      { type: 'income', amount: 1000, date: '2026-06-01' },
      { type: 'expense', amount: 300, date: '2026-06-10' },
      { type: 'expense', amount: 50, date: '2026-05-10' }, // otro mes, no cuenta
      { type: 'settlement', amount: 999, date: '2026-06-05' }, // no es income/expense
    ];
    expect(monthCashFlow(tx, '2026-06')).toEqual({ income: 1000, expense: 300, balance: 700 });
  });
  it('incluye recurrentes multiplicadas por sus ocurrencias en el mes', () => {
    const tx = [{ type: 'expense', amount: 100, date: '2026-01-01', recurring: true, frequency: 'semanal' }];
    expect(monthCashFlow(tx, '2026-06').expense).toBe(400); // semanal = 4 veces
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
