import { describe, it, expect } from 'vitest';
import { readJSON, writeJSON, removeKey } from './safeStorage';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

describe('readJSON / writeJSON / removeKey', () => {
  it('guarda y lee un valor', () => {
    const s = fakeStorage();
    expect(writeJSON(s, 'k', { a: 1 })).toBe(true);
    expect(readJSON(s, 'k', null)).toEqual({ a: 1 });
  });
  it('devuelve el fallback si no existe o el JSON está dañado', () => {
    const s = fakeStorage({ malo: '{no es json' });
    expect(readJSON(s, 'no-existe', 'fb')).toBe('fb');
    expect(readJSON(s, 'malo', 'fb')).toBe('fb');
  });
  it('writeJSON devuelve false (sin lanzar) si el storage falla, ej. cuota llena', () => {
    const s = { setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(writeJSON(s, 'k', 1)).toBe(false);
  });
  it('funciona sin storage disponible', () => {
    expect(readJSON(undefined, 'k', 'fb')).toBe('fb');
    expect(() => removeKey(undefined, 'k')).not.toThrow();
  });
  it('removeKey borra la llave', () => {
    const s = fakeStorage({ k: '1' });
    removeKey(s, 'k');
    expect(readJSON(s, 'k', 'vacío')).toBe('vacío');
  });
});
