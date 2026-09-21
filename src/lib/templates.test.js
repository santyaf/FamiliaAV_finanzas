import { describe, it, expect } from 'vitest';
import { templateToForm, templateToTransaction, canQuickRegister, sortTemplates } from './templates';

const accounts = [{ id: 'a1', name: 'Nómina' }];
const categories = [{ id: 'mer', name: 'Mercado', type: 'expense' }, { id: 'sal', name: 'Salario', type: 'income' }];
const ctx = { accounts, categories };

describe('templateToForm', () => {
  it('llena el formulario con lo de la plantilla', () => {
    expect(templateToForm({ name: 'Mercado D1', type: 'expense', description: 'D1', amount: 85000, categoryId: 'mer', accountId: 'a1' }, ctx))
      .toEqual({ type: 'expense', description: 'D1', amount: '85000', categoryId: 'mer', accountId: 'a1' });
  });
  it('sin descripción usa el nombre; sin monto lo deja vacío', () => {
    const f = templateToForm({ name: 'Gasolina', type: 'expense', categoryId: 'mer', accountId: 'a1' }, ctx);
    expect(f.description).toBe('Gasolina');
    expect(f.amount).toBe('');
  });
  it('ignora una cuenta o categoría que no existe o no es del mismo tipo', () => {
    const f = templateToForm({ name: 'X', type: 'income', categoryId: 'mer', accountId: 'oculta' }, ctx);
    expect(f.categoryId).toBe('');
    expect(f.accountId).toBe('');
  });
});

describe('templateToTransaction / canQuickRegister', () => {
  const full = { name: 'Almuerzo', type: 'expense', amount: 18000, categoryId: 'mer', accountId: 'a1' };
  it('arma el movimiento de hoy para registrarlo de un toque', () => {
    expect(templateToTransaction(full, { ...ctx, memberId: 'm1', date: '2026-09-18' })).toMatchObject({
      type: 'expense', description: 'Almuerzo', amount: 18000, categoryId: 'mer', accountId: 'a1', memberId: 'm1', date: '2026-09-18', recurring: false, isShared: false,
    });
  });
  it('sin monto, categoría o cuenta visible no se puede registrar directo', () => {
    expect(canQuickRegister(full, ctx)).toBe(true);
    expect(canQuickRegister({ ...full, amount: null }, ctx)).toBe(false);
    expect(canQuickRegister({ ...full, accountId: 'otra' }, ctx)).toBe(false);
    expect(canQuickRegister({ ...full, categoryId: null }, ctx)).toBe(false);
  });
});

describe('sortTemplates', () => {
  it('primero las de un toque, luego por nombre', () => {
    const list = [
      { name: 'Zeta', type: 'expense', amount: 5, categoryId: 'mer', accountId: 'a1' },
      { name: 'Beta', type: 'expense', categoryId: 'mer', accountId: 'a1' },
      { name: 'Alfa', type: 'expense', amount: 5, categoryId: 'mer', accountId: 'a1' },
    ];
    expect(sortTemplates(list, ctx).map((t) => t.name)).toEqual(['Alfa', 'Zeta', 'Beta']);
  });
});
