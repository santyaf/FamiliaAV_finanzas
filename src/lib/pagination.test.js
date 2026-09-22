import { describe, it, expect } from 'vitest';
import { PAGE_SIZE, pageSlice, nextCount } from './pagination';

describe('pagination', () => {
  const list = Array.from({ length: 120 }, (_, i) => i);
  it('muestra solo la primera página', () => {
    expect(pageSlice(list, PAGE_SIZE)).toHaveLength(50);
    expect(pageSlice(list, 500)).toHaveLength(120);
    expect(pageSlice(list, 0)).toEqual([]);
    expect(pageSlice(list, -3)).toEqual([]);
    expect(pageSlice([], 50)).toEqual([]);
  });
  it('pedir más no pasa del total', () => {
    expect(nextCount(50, 120)).toBe(100);
    expect(nextCount(100, 120)).toBe(120);
    expect(nextCount(120, 120)).toBe(120);
    expect(nextCount(10, 120, 5)).toBe(15);
  });
});
