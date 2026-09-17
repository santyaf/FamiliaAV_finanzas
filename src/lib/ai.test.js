import { describe, it, expect } from 'vitest';
import { stripJsonFences, matchCategory, matchMember } from './ai';

describe('stripJsonFences', () => {
  it('quita fences ```json y ``` y recorta espacios', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFences('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe('matchCategory', () => {
  const categories = [
    { id: 'c1', name: 'Mercado', type: 'expense' },
    { id: 'c2', name: 'Transporte', type: 'expense' },
    { id: 'c3', name: 'Nómina', type: 'income' },
  ];

  it('encuentra coincidencia exacta ignorando acentos y mayúsculas', () => {
    expect(matchCategory('nomina', 'income', categories)).toBe('c3');
  });

  it('encuentra coincidencia parcial', () => {
    expect(matchCategory('transp', 'expense', categories)).toBe('c2');
  });

  it('usa la primera categoría del tipo si no hay guess', () => {
    expect(matchCategory(null, 'expense', categories)).toBe('c1');
  });

  it('cae a la primera categoría del tipo si no hay coincidencia', () => {
    expect(matchCategory('algo raro', 'expense', categories)).toBe('c1');
  });
});

describe('matchMember', () => {
  const members = [{ id: 'm1', name: 'Santiago' }, { id: 'm2', name: 'Ana' }];

  it('encuentra por nombre exacto o parcial', () => {
    expect(matchMember('santiago', members)).toBe('m1');
    expect(matchMember('An', members)).toBe('m2');
  });

  it('devuelve null si no hay guess o no hay coincidencia', () => {
    expect(matchMember(null, members)).toBe(null);
    expect(matchMember('Pedro', members)).toBe(null);
  });
});
