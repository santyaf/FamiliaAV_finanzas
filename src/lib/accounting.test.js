import { describe, it, expect } from 'vitest';
import {
  NATURES, TRANSACTION_NATURES, natureLabel, effectiveNature, DEFAULT_CATEGORY_SPECS,
  INTEREST_CATEGORY, LOAN_INCOME_CATEGORY, splitInstallment,
} from './accounting';

describe('effectiveNature', () => {
  it('usa la del movimiento si la tiene, si no la de su categoría, si no operativo', () => {
    expect(effectiveNature({ nature: 'financiamiento' }, { nature: 'operativo' })).toBe('financiamiento');
    expect(effectiveNature({}, { nature: 'inversion' })).toBe('inversion');
    expect(effectiveNature({ nature: null }, undefined)).toBe('operativo');
    expect(effectiveNature(undefined, undefined)).toBe('operativo');
  });
  it('un movimiento de apertura conserva su naturaleza aunque la categoría diga otra', () => {
    expect(effectiveNature({ nature: 'apertura' }, { nature: 'operativo' })).toBe('apertura');
  });
});

describe('natureLabel', () => {
  it('traduce las naturalezas y devuelve el id si no la conoce', () => {
    expect(natureLabel('financiamiento')).toBe('Financiamiento');
    expect(natureLabel('apertura')).toBe('Saldo inicial');
    expect(natureLabel('x')).toBe('x');
  });
  it('las naturalezas de categoría son un subconjunto de las de movimiento', () => {
    NATURES.forEach((n) => expect(TRANSACTION_NATURES.map((t) => t.id)).toContain(n.id));
    expect(NATURES.map((n) => n.id)).not.toContain('apertura');
  });
});

describe('DEFAULT_CATEGORY_SPECS', () => {
  it('no repite nombre dentro de un mismo tipo', () => {
    const keys = DEFAULT_CATEGORY_SPECS.map((c) => `${c.type}|${c.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('todas tienen rubro y una naturaleza válida', () => {
    DEFAULT_CATEGORY_SPECS.forEach((c) => {
      expect(c.group).toBeTruthy();
      expect(NATURES.map((n) => n.id)).toContain(c.nature);
    });
  });
  it('las deudas son financiamiento y los intereses son gasto operativo', () => {
    const deudas = DEFAULT_CATEGORY_SPECS.find((c) => c.name === 'Deudas y préstamos');
    expect(deudas.nature).toBe('financiamiento');
    expect(INTEREST_CATEGORY).toMatchObject({ type: 'expense', nature: 'operativo' });
  });
  it('los préstamos recibidos son un ingreso de financiamiento', () => {
    expect(LOAN_INCOME_CATEGORY).toMatchObject({ type: 'income', nature: 'financiamiento' });
  });
});

describe('splitInstallment', () => {
  it('separa el capital (pasivo) de intereses + seguro (gasto)', () => {
    expect(splitInstallment({ capital: 800000, interest: 150000, insurance: 20000 })).toEqual({ capital: 800000, cost: 170000 });
  });
  it('tolera valores ausentes y redondea a centavos', () => {
    expect(splitInstallment({ capital: 100.006, interest: 0.1, insurance: 0.2 })).toEqual({ capital: 100.01, cost: 0.3 });
    expect(splitInstallment({ capital: 500 })).toEqual({ capital: 500, cost: 0 });
  });
});
