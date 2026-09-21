import { describe, it, expect } from 'vitest';
import { monthGrid, shiftMonth, datesInMonth, buildCalendar } from './calendar';

describe('monthGrid / shiftMonth', () => {
  it('septiembre de 2026 empieza en martes (lunes = 0) y tiene 30 días', () => {
    expect(monthGrid('2026-09')).toEqual({ year: 2026, month: 9, days: 30, firstWeekday: 1, weeks: 5 });
  });
  it('un mes puede necesitar seis semanas', () => {
    expect(monthGrid('2026-08').weeks).toBe(6); // agosto de 2026 empieza en sábado y tiene 31 días
  });
  it('febrero bisiesto', () => expect(monthGrid('2028-02').days).toBe(29));
  it('avanza y retrocede cruzando el año', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-09', 0)).toBe('2026-09');
  });
});

describe('datesInMonth', () => {
  it('mensual: el mismo día, ajustado al último día de meses cortos, y no antes de empezar', () => {
    expect(datesInMonth('2026-01-31', 'mensual', '2026-02')).toEqual(['2026-02-28']);
    expect(datesInMonth('2026-01-31', 'mensual', '2026-04')).toEqual(['2026-04-30']);
    expect(datesInMonth('2026-05-10', 'mensual', '2026-04')).toEqual([]);
    expect(datesInMonth('2026-05-10', 'mensual', '2026-05')).toEqual(['2026-05-10']);
  });
  it('anual: solo el mes de la fecha, desde ese año', () => {
    expect(datesInMonth('2024-03-15', 'anual', '2026-03')).toEqual(['2026-03-15']);
    expect(datesInMonth('2024-03-15', 'anual', '2026-04')).toEqual([]);
    expect(datesInMonth('2027-03-15', 'anual', '2026-03')).toEqual([]);
    expect(datesInMonth('2024-02-29', 'anual', '2026-02')).toEqual(['2026-02-28']);
  });
  it('semanal y quincenal (cada 14 días) caen en varias fechas del mes', () => {
    expect(datesInMonth('2026-08-31', 'semanal', '2026-09')).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(datesInMonth('2026-09-01', 'quincenal', '2026-09')).toEqual(['2026-09-01', '2026-09-15', '2026-09-29']);
    expect(datesInMonth('2026-10-05', 'semanal', '2026-09')).toEqual([]);
  });
  it('sin fecha de inicio no hay nada', () => expect(datesInMonth(null, 'mensual', '2026-09')).toEqual([]));
});

describe('buildCalendar', () => {
  const base = {
    monthKey: '2026-09',
    categories: [{ id: 'sal', name: 'Salario' }, { id: 'viv', name: 'Vivienda' }],
    transactions: [
      { id: 't1', type: 'income', recurring: true, frequency: 'quincenal', date: '2026-09-01', amount: 2000000, categoryId: 'sal', description: 'Nómina' },
      { id: 't2', type: 'expense', recurring: true, frequency: 'mensual', date: '2026-01-05', amount: 900000, categoryId: 'viv' },
      { id: 't3', type: 'expense', recurring: false, date: '2026-09-09', amount: 50 },
    ],
    obligations: [
      { id: 'o1', name: 'Internet', enabled: true, frequency: 'mensual', nextDueDate: '2026-09-12', amount: 90000 },
      { id: 'o2', name: 'Apagada', enabled: false, frequency: 'mensual', nextDueDate: '2026-09-12', amount: 1 },
    ],
    creditsWithPayments: [
      { credit: { id: 'k1', name: 'Libranza', currency: 'COP' }, payments: [
        { installmentNumber: 3, dueDate: '2026-09-30', total: 250000, paid: false },
        { installmentNumber: 2, dueDate: '2026-08-31', total: 250000, paid: true },
      ] },
      { credit: { id: 'k2', name: 'Crédito UVR', currency: 'UVR' }, payments: [{ installmentNumber: 1, dueDate: '2026-09-20', total: 500, paid: false }] },
    ],
    accounts: [{ id: 'tc', name: 'Visa', paymentKind: 'tarjeta_credito', statementDay: 15, paymentDay: 31 }, { id: 'a1', name: 'Ahorros', paymentKind: 'ahorros' }],
    goals: [{ id: 'g1', name: 'Viaje', targetDate: '2026-09-25', targetAmount: 5000000, currentAmount: 3000000 }],
    assets: [{ id: 'as1', name: 'CDT', kind: 'inversion', maturityDate: '2026-09-18', status: 'activo' }, { id: 'as2', name: 'Vendido', kind: 'inversion', maturityDate: '2026-09-19', status: 'vendido' }],
  };
  const cal = buildCalendar(base);
  const kinds = (date) => (cal.byDate[date] || []).map((e) => e.kind);

  it('junta recurrentes, obligaciones, cuotas, tarjetas, metas y vencimientos', () => {
    expect(kinds('2026-09-01')).toEqual(['recurrente']); // nómina quincenal
    expect(kinds('2026-09-15')).toContain('recurrente');
    expect(kinds('2026-09-15')).toContain('tarjeta_corte');
    expect(kinds('2026-09-05')).toEqual(['recurrente']); // arriendo
    expect(kinds('2026-09-12')).toEqual(['obligacion']);
    expect(kinds('2026-09-30')).toContain('cuota');
    expect(kinds('2026-09-30')).toContain('tarjeta_pago'); // día 31 → 30 en septiembre
    expect(kinds('2026-09-25')).toEqual(['objetivo']);
    expect(kinds('2026-09-18')).toEqual(['vencimiento']);
  });
  it('no incluye movimientos únicos, obligaciones apagadas, cuotas de otros meses ni activos vendidos', () => {
    expect(cal.events.some((e) => e.label === 'Apagada')).toBe(false);
    expect(cal.events.some((e) => e.date === '2026-08-31')).toBe(false);
    expect(cal.events.some((e) => e.label.includes('Vendido'))).toBe(false);
    expect(cal.events.some((e) => e.amount === 50)).toBe(false);
  });
  it('totales del mes: lo que entra y lo que sale, sin lo ya pagado ni las cuotas en UVR', () => {
    // entra: nómina 3 veces (1, 15, 29). sale: arriendo 900.000 + internet 90.000 + cuota 250.000
    expect(cal.totals.in).toBe(6000000);
    expect(cal.totals.out).toBe(900000 + 90000 + 250000);
  });
  it('una cuota pagada figura pagada y no suma', () => {
    const c = buildCalendar({ ...base, monthKey: '2026-08' });
    const paid = c.events.find((e) => e.kind === 'cuota');
    expect(paid.status).toBe('pagado');
    expect(c.totals.out).toBe(900000);
  });
  it('los eventos salen ordenados por fecha', () => {
    const dates = cal.events.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });
  it('una meta ya cumplida aparece como cumplida', () => {
    const c = buildCalendar({ ...base, goals: [{ id: 'g', name: 'X', targetDate: '2026-09-02', targetAmount: 10, currentAmount: 10 }] });
    expect(c.byDate['2026-09-02'][0].status).toBe('pagado');
  });
});
