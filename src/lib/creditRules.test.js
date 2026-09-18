import { describe, it, expect } from 'vitest';
import {
  nextDateWithDay, dueLibranzaInstallments, installmentInCop, libranzaDeductionsForMonth, CREDIT_EVENT_LABELS,
} from './creditRules';

describe('nextDateWithDay', () => {
  it('si el día todavía no pasó este mes, es este mes', () => {
    expect(nextDateWithDay('2026-09-18', 30)).toBe('2026-09-30');
    expect(nextDateWithDay('2026-09-18', 18)).toBe('2026-09-18'); // hoy cuenta
  });
  it('si ya pasó, es el mes siguiente', () => {
    expect(nextDateWithDay('2026-09-18', 5)).toBe('2026-10-05');
    expect(nextDateWithDay('2026-12-20', 15)).toBe('2027-01-15');
  });
  it('el día 31 se ajusta al último día de los meses cortos', () => {
    expect(nextDateWithDay('2026-02-10', 31)).toBe('2026-02-28');
    expect(nextDateWithDay('2028-02-10', 31)).toBe('2028-02-29');
    expect(nextDateWithDay('2026-04-01', 31)).toBe('2026-04-30');
    expect(nextDateWithDay('2026-01-31', 30)).toBe('2026-02-28'); // 30 ene ya pasó → 30 feb no existe
  });
});

describe('dueLibranzaInstallments', () => {
  const credit = { paymentSource: 'libranza', autoRegister: true, status: 'activo' };
  const payments = [
    { installmentNumber: 3, dueDate: '2026-09-30', paid: false },
    { installmentNumber: 1, dueDate: '2026-07-31', paid: true },
    { installmentNumber: 2, dueDate: '2026-08-31', paid: false },
    { installmentNumber: 4, dueDate: '2026-10-31', paid: false },
  ];
  it('devuelve en orden las cuotas pendientes que ya vencieron', () => {
    expect(dueLibranzaInstallments(credit, payments, '2026-09-30').map((p) => p.installmentNumber)).toEqual([2, 3]);
    expect(dueLibranzaInstallments(credit, payments, '2026-08-30')).toEqual([]);
  });
  it('no aplica si no es libranza, no tiene registro automático o ya está pagado', () => {
    expect(dueLibranzaInstallments({ ...credit, paymentSource: 'cuenta' }, payments, '2027-01-01')).toEqual([]);
    expect(dueLibranzaInstallments({ ...credit, autoRegister: false }, payments, '2027-01-01')).toEqual([]);
    expect(dueLibranzaInstallments({ ...credit, status: 'pagado' }, payments, '2027-01-01')).toEqual([]);
  });
});

describe('installmentInCop', () => {
  const inst = { capital: 800, interest: 150, insurance: 50 };
  it('en pesos no convierte: capital y costo (intereses + seguro)', () => {
    expect(installmentInCop(inst, { currency: 'COP' })).toEqual({ capital: 800, cost: 200, total: 1000 });
  });
  it('en UVR convierte con el valor de la UVR de ese día', () => {
    expect(installmentInCop(inst, { currency: 'UVR' }, 420.5)).toEqual({ capital: 336400, cost: 84100, total: 420500 });
  });
  it('en UVR sin valor de UVR lanza un error claro (no registra cifras en UVR como si fueran pesos)', () => {
    expect(() => installmentInCop(inst, { currency: 'UVR' })).toThrow(/UVR/);
    expect(() => installmentInCop(inst, { currency: 'UVR' }, 0)).toThrow(/UVR/);
  });
  it('redondea a centavos', () => {
    expect(installmentInCop({ capital: 1, interest: 0, insurance: 0 }, { currency: 'UVR' }, 417.9009).capital).toBe(417.9);
  });
});

describe('libranzaDeductionsForMonth', () => {
  const credits = [
    { id: 'c1', name: 'Libranza Banco X', paymentSource: 'libranza', status: 'activo' },
    { id: 'c2', name: 'Hipoteca', paymentSource: 'cuenta', status: 'activo' },
    { id: 'c3', name: 'Libranza vieja', paymentSource: 'libranza', status: 'pagado' },
  ];
  const byCredit = {
    c1: [{ installmentNumber: 5, dueDate: '2026-09-30', total: 250000, paid: false }, { installmentNumber: 6, dueDate: '2026-10-31', total: 250000, paid: false }],
    c2: [{ installmentNumber: 1, dueDate: '2026-09-05', total: 900000, paid: false }],
    c3: [{ installmentNumber: 9, dueDate: '2026-09-30', total: 100000, paid: true }],
  };
  it('suma solo las libranzas activas de ese mes', () => {
    const rows = libranzaDeductionsForMonth(credits, byCredit, '2026-09');
    expect(rows).toEqual([{ creditId: 'c1', name: 'Libranza Banco X', installmentNumber: 5, dueDate: '2026-09-30', total: 250000, paid: false }]);
  });
  it('un mes sin cuotas devuelve vacío', () => {
    expect(libranzaDeductionsForMonth(credits, byCredit, '2026-12')).toEqual([]);
  });
});

describe('CREDIT_EVENT_LABELS', () => {
  it('cubre todos los tipos de evento que acepta la base de datos', () => {
    expect(Object.keys(CREDIT_EVENT_LABELS).sort()).toEqual(['abono', 'cambio_condiciones', 'creacion', 'pago_revertido', 'rediferido', 'retanqueo']);
  });
});
