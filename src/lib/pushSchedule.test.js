import { describe, it, expect } from 'vitest';
import { localParts, previousMonthOf, shouldSendDigest, nextPaymentDate, cardPaymentAlert, cardAlertText } from './pushSchedule';

describe('localParts', () => {
  it('convierte a la hora de Bogotá (UTC-5) cruzando de día', () => {
    // 2026-10-01 03:30 UTC = 2026-09-30 22:30 en Bogotá
    expect(localParts(new Date('2026-10-01T03:30:00Z'), 'America/Bogota')).toMatchObject({ dateStr: '2026-09-30', monthKey: '2026-09', day: 30, hour: 22, minute: 30 });
    expect(localParts(new Date('2026-10-01T14:05:00Z'), 'America/Bogota')).toMatchObject({ dateStr: '2026-10-01', day: 1, hour: 9, minute: 5 });
  });
  it('la medianoche es hora 0, no 24', () => {
    expect(localParts(new Date('2026-10-01T05:00:00Z'), 'America/Bogota').hour).toBe(0);
  });
});

describe('previousMonthOf', () => {
  it('mes anterior con su nombre, cruzando el año', () => {
    expect(previousMonthOf('2026-10')).toEqual({ key: '2026-09', label: 'septiembre 2026' });
    expect(previousMonthOf('2026-01')).toEqual({ key: '2025-12', label: 'diciembre 2025' });
  });
});

describe('shouldSendDigest', () => {
  it('los primeros 5 días del mes desde las 9:00, una vez', () => {
    expect(shouldSendDigest({ day: 1, hour: 9 }, false)).toBe(true);
    expect(shouldSendDigest({ day: 1, hour: 8 }, false)).toBe(false);
    expect(shouldSendDigest({ day: 5, hour: 15 }, false)).toBe(true); // se recupera si el cron estuvo caído
    expect(shouldSendDigest({ day: 6, hour: 12 }, false)).toBe(false);
    expect(shouldSendDigest({ day: 1, hour: 12 }, true)).toBe(false); // ya enviado este mes
  });
});

describe('nextPaymentDate', () => {
  it('este mes si el día no ha pasado, si no el siguiente', () => {
    expect(nextPaymentDate(25, '2026-09-21')).toBe('2026-09-25');
    expect(nextPaymentDate(25, '2026-09-25')).toBe('2026-09-25');
    expect(nextPaymentDate(10, '2026-09-21')).toBe('2026-10-10');
    expect(nextPaymentDate(10, '2026-12-21')).toBe('2027-01-10');
  });
  it('ajusta a meses cortos', () => {
    expect(nextPaymentDate(31, '2026-02-10')).toBe('2026-02-28');
    expect(nextPaymentDate(31, '2026-04-10')).toBe('2026-04-30');
  });
  it('sin día no hay fecha', () => expect(nextPaymentDate(null, '2026-09-21')).toBeNull());
});

describe('cardPaymentAlert', () => {
  const local = (dateStr, hour = 9) => ({ dateStr, hour });
  it('avisa desde 2 días antes hasta el día del pago', () => {
    expect(cardPaymentAlert({ paymentDay: 25 }, local('2026-09-23'))).toEqual({ dueDate: '2026-09-25', daysLeft: 2 });
    expect(cardPaymentAlert({ paymentDay: 25 }, local('2026-09-24'))).toEqual({ dueDate: '2026-09-25', daysLeft: 1 });
    expect(cardPaymentAlert({ paymentDay: 25 }, local('2026-09-25'))).toEqual({ dueDate: '2026-09-25', daysLeft: 0 });
  });
  it('antes de esa ventana, o antes de las 8:00, no avisa', () => {
    expect(cardPaymentAlert({ paymentDay: 25 }, local('2026-09-22'))).toBeNull();
    expect(cardPaymentAlert({ paymentDay: 25 }, local('2026-09-24', 7))).toBeNull();
  });
  it('pasado el día, el siguiente aviso es del mes que viene (no repite el de ayer)', () => {
    expect(cardPaymentAlert({ paymentDay: 25 }, local('2026-09-26'))).toBeNull();
  });
  it('funciona cruzando de mes', () => {
    expect(cardPaymentAlert({ paymentDay: 1 }, local('2026-09-30'))).toEqual({ dueDate: '2026-10-01', daysLeft: 1 });
  });
  it('sin día de pago no avisa', () => expect(cardPaymentAlert({ paymentDay: null }, local('2026-09-24'))).toBeNull());
  it('el texto dice hoy, mañana o en N días', () => {
    expect(cardAlertText('Visa', { daysLeft: 0 }).body).toMatch(/hoy/);
    expect(cardAlertText('Visa', { daysLeft: 1 }).body).toMatch(/mañana/);
    expect(cardAlertText('Visa', { daysLeft: 2 })).toMatchObject({ title: 'Pago de tarjeta Visa' });
    expect(cardAlertText('Visa', { daysLeft: 2 }).body).toMatch(/en 2 días/);
  });
});
