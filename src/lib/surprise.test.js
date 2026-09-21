import { describe, it, expect } from 'vitest';
import { FOREVER, isHiddenNow, canHide, privateUntilValue, validateHideUntil, hiddenLabel } from './surprise';

describe('surprise', () => {
  it('está oculto mientras la fecha no llegue', () => {
    expect(isHiddenNow({ privateUntil: '2026-12-25' }, '2026-09-21')).toBe(true);
    expect(isHiddenNow({ privateUntil: '2026-09-21' }, '2026-09-21')).toBe(false); // ese día ya se muestra
    expect(isHiddenNow({ privateUntil: FOREVER }, '2099-01-01')).toBe(true);
    expect(isHiddenNow({}, '2026-09-21')).toBe(false);
    expect(isHiddenNow(null, '2026-09-21')).toBe(false);
  });
  it('solo se puede ocultar un ingreso o gasto de una cuenta compartida, con más personas en el hogar', () => {
    const shared = { type: 'shared' }; const own = { type: 'individual' };
    expect(canHide({ type: 'expense', account: shared, membersCount: 2 })).toBe(true);
    expect(canHide({ type: 'income', account: shared, membersCount: 2 })).toBe(true);
    expect(canHide({ type: 'expense', account: own, membersCount: 2 })).toBe(false); // ya es privado
    expect(canHide({ type: 'expense', account: shared, membersCount: 1 })).toBe(false);
    expect(canHide({ type: 'transfer', account: shared, membersCount: 3 })).toBe(false);
    expect(canHide({ type: 'expense', account: undefined, membersCount: 3 })).toBe(false);
  });
  it('el valor a guardar', () => {
    expect(privateUntilValue(false, '2026-12-25')).toBeNull();
    expect(privateUntilValue(true, '2026-12-25')).toBe('2026-12-25');
    expect(privateUntilValue(true, '')).toBe(FOREVER);
  });
  it('la fecha debe ser futura (o vacía)', () => {
    expect(validateHideUntil('', '2026-09-21')).toBe('');
    expect(validateHideUntil('2026-09-22', '2026-09-21')).toBe('');
    expect(validateHideUntil('2026-09-21', '2026-09-21')).toMatch(/fecha futura/);
    expect(validateHideUntil('2026-01-01', '2026-09-21')).toMatch(/fecha futura/);
  });
  it('etiqueta', () => {
    const fmt = (d) => `<${d}>`;
    expect(hiddenLabel(null, fmt)).toBe('');
    expect(hiddenLabel(FOREVER, fmt)).toBe('Oculto a los demás');
    expect(hiddenLabel('2026-12-25', fmt)).toBe('Oculto hasta el <2026-12-25>');
  });
});
