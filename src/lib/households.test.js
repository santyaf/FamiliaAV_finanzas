import { describe, it, expect } from 'vitest';
import { chooseActiveHousehold, normalizeCachedHouseholds, householdOptions, readActiveHouseholdId, saveActiveHouseholdId } from './households';

const h = (id, name, role = 'member') => ({ householdId: id, role, color: '#2F6E68', household: { id, name, currency: 'COP' } });
const list = [h('a', 'Casa'), h('b', 'Papás', 'admin'), h('c', 'Fondo')];
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

describe('chooseActiveHousehold', () => {
  it('respeta el preferido si sigue en la lista', () => { expect(chooseActiveHousehold(list, 'b').householdId).toBe('b'); });
  it('si el preferido ya no está, usa el primero', () => { expect(chooseActiveHousehold(list, 'zzz').householdId).toBe('a'); });
  it('sin preferido usa el primero', () => { expect(chooseActiveHousehold(list, null).householdId).toBe('a'); });
  it('sin hogares devuelve null', () => {
    expect(chooseActiveHousehold([], 'a')).toBeNull();
    expect(chooseActiveHousehold(undefined, 'a')).toBeNull();
  });
});

describe('preferencia guardada', () => {
  it('se guarda por persona', () => {
    const st = memory();
    saveActiveHouseholdId(st, 'u1', 'b');
    expect(readActiveHouseholdId(st, 'u1')).toBe('b');
    expect(readActiveHouseholdId(st, 'u2')).toBeNull();
  });
  it('un valor raro o sin storage no rompe', () => {
    const st = memory(); st.setItem('fam_active_household_v1:u1', '{"x":1}');
    expect(readActiveHouseholdId(st, 'u1')).toBeNull();
    expect(readActiveHouseholdId(undefined, 'u1')).toBeNull();
    expect(() => saveActiveHouseholdId(undefined, 'u1', 'a')).not.toThrow();
  });
  it('no guarda un id vacío', () => {
    const st = memory(); saveActiveHouseholdId(st, 'u1', null);
    expect(readActiveHouseholdId(st, 'u1')).toBeNull();
  });
});

describe('normalizeCachedHouseholds', () => {
  it('acepta la lista nueva', () => { expect(normalizeCachedHouseholds(list)).toHaveLength(3); });
  it('convierte el formato anterior (un solo hogar) en lista', () => { expect(normalizeCachedHouseholds(list[0])).toEqual([list[0]]); });
  it('ignora basura', () => {
    expect(normalizeCachedHouseholds(null)).toEqual([]);
    expect(normalizeCachedHouseholds({})).toEqual([]);
    expect(normalizeCachedHouseholds([{}, list[1]])).toEqual([list[1]]);
  });
});

describe('householdOptions', () => {
  it('marca el activo y traduce el rol', () => {
    const o = householdOptions(list, 'b');
    expect(o.map((x) => x.isActive)).toEqual([false, true, false]);
    expect(o[1]).toMatchObject({ name: 'Papás', roleLabel: 'Administrador' });
    expect(o[0].roleLabel).toBe('Integrante');
  });
});
