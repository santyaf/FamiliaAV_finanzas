import { describe, it, expect } from 'vitest';
import { parseBankMessage, findAmount, findDate, findType, findMerchant } from './smsParser';

const TODAY = '2026-09-21';
const parse = (t) => parseBankMessage(t, { todayISO: TODAY });

describe('findAmount', () => {
  it.each([
    ['Compraste $45.000 en EXITO', 45000],
    ['por $1.234.567,89 hoy', 1234567.89],
    ['COP 120.500 en RAPPI', 120500],
    ['valor $2,300,000.00', 2300000],
    ['pagaste $500', 500],
    ['Retiro por 200.000 en cajero', 200000],
  ])('%s → %s', (t, v) => expect(findAmount(t)).toBe(v));
  it('sin monto es null', () => expect(findAmount('Hola, tu clave venció')).toBeNull());
});

describe('findDate', () => {
  it('formatos comunes', () => {
    expect(findDate('el 21/09/2026 a las 14:32', TODAY)).toBe('2026-09-21');
    expect(findDate('fecha 05-03-26', TODAY)).toBe('2026-03-05');
    expect(findDate('2026-09-18 10:00', TODAY)).toBe('2026-09-18');
    expect(findDate('el 3 de sep de 2026', TODAY)).toBe('2026-09-03');
    expect(findDate('el 7 sep', TODAY)).toBe('2026-09-07');
  });
  it('sin fecha es null (se usará hoy)', () => expect(findDate('Compraste $45.000 en EXITO', TODAY)).toBeNull());
  it('ignora fechas imposibles', () => expect(findDate('el 45/13/2026', TODAY)).toBeNull());
});

describe('findType', () => {
  it('ingresos y gastos por sus palabras', () => {
    expect(findType('Recibiste $50.000 de JUAN')).toBe('income');
    expect(findType('Compraste $45.000 en EXITO')).toBe('expense');
    expect(findType('Retiro en cajero por $200.000')).toBe('expense');
    expect(findType('Te consignaron $1.000.000')).toBe('income');
    expect(findType('Tu saldo es $5.000')).toBeNull();
  });
  it('si hay de los dos gana el primero que aparece', () => {
    expect(findType('Transferencia recibida por $1.500.000 pago de nómina')).toBe('income');
  });
});

describe('parseBankMessage — SMS reales de bancos colombianos (formatos representativos)', () => {
  it('Bancolombia: compra con tarjeta débito', () => {
    const r = parse('Bancolombia: Compraste $45.000 en EXITO LAURELES con tu T.Deb *1234 el 21/09/2026 a las 14:32.');
    expect(r).toMatchObject({ type: 'expense', amount: 45000, description: 'EXITO LAURELES', date: '2026-09-21' });
  });
  it('Davivienda: compra por', () => {
    const r = parse('Davivienda: Realizaste una compra por $120.500 en RAPPI COLOMBIA con tarjeta terminada en 9876.');
    expect(r).toMatchObject({ type: 'expense', amount: 120500, description: 'RAPPI COLOMBIA' });
  });
  it('Nequi: recibiste dinero de una persona', () => {
    const r = parse('Nequi: Recibiste $50.000 de JUAN PEREZ. Tu saldo es $80.000.');
    expect(r).toMatchObject({ type: 'income', amount: 50000, description: 'JUAN PEREZ' });
  });
  it('pago de servicios', () => {
    const r = parse('Bancolombia le informa Pago de servicios por $89.900 a CLARO COLOMBIA el 19/09/2026.');
    expect(r).toMatchObject({ type: 'expense', amount: 89900, description: 'CLARO COLOMBIA', date: '2026-09-19' });
  });
  it('retiro en cajero sin comercio', () => {
    const r = parse('Retiro en cajero por $200.000 el 20/09/2026');
    expect(r).toMatchObject({ type: 'expense', amount: 200000, description: 'Retiro en cajero' });
  });
  it('consignación de nómina', () => {
    const r = parse('Te llegaron $2.300.000 por concepto de nómina el 15/09/2026');
    expect(r).toMatchObject({ type: 'income', amount: 2300000, date: '2026-09-15' });
    expect(r.description).toMatch(/nómina/i);
  });
  it('transferencia recibida de una empresa', () => {
    const r = parse('Transferencia recibida por $1.500.000 de EMPRESA SAS en tu cuenta de ahorros.');
    expect(r).toMatchObject({ type: 'income', amount: 1500000, description: 'EMPRESA SAS' });
  });
});

describe('parseBankMessage — casos límite', () => {
  it('texto vacío o sin datos no inventa nada', () => {
    expect(parse('')).toEqual({ type: null, amount: null, description: null, date: null, found: [] });
    const r = parse('Tu clave de Bancolombia vence pronto');
    expect(r.amount).toBeNull();
    expect(r.found).toEqual([]);
  });
  it('con monto pero sin verbo claro, asume gasto (la persona lo corrige)', () => {
    expect(parse('Movimiento por $30.000').type).toBe('expense');
  });
  it('found lista lo que sí se leyó', () => {
    expect(parse('Compraste $45.000 en EXITO').found).toEqual(['tipo', 'monto', 'comercio']);
  });
  it('findMerchant no confunde "tu cuenta" con un comercio', () => {
    expect(findMerchant('Se debitó de tu cuenta $45.000', 'expense')).toBeNull();
  });
});
