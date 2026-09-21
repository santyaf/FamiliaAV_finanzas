// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HouseholdSwitcherModal } from './Hogares';

afterEach(() => cleanup());

const h = (id, name, role = 'member') => ({ householdId: id, role, color: '#2F6E68', household: { id, name, currency: 'COP' } });
const data = { households: [h('a', 'Casa García', 'admin'), h('b', 'Los papás'), h('c', 'Fondo amigos')], activeHouseholdId: 'a' };
const setup = () => {
  const actions = { switchHousehold: vi.fn(), addHousehold: vi.fn() };
  const onClose = vi.fn();
  render(<HouseholdSwitcherModal data={data} actions={actions} onClose={onClose} />);
  return { actions, onClose };
};

describe('HouseholdSwitcherModal', () => {
  it('lista los hogares con su rol y marca el actual', () => {
    setup();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Casa García/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Los papás/ }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Administrador · COP')).toBeTruthy();
  });
  it('elegir otro hogar lo activa y cierra', () => {
    const { actions, onClose } = setup();
    fireEvent.click(screen.getByRole('radio', { name: /Los papás/ }));
    expect(actions.switchHousehold).toHaveBeenCalledWith('b');
    expect(onClose).toHaveBeenCalled();
  });
  it('elegir el hogar actual solo cierra', () => {
    const { actions, onClose } = setup();
    fireEvent.click(screen.getByRole('radio', { name: /Casa García/ }));
    expect(actions.switchHousehold).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
  it('permite crear otro hogar o unirse con código', () => {
    const { actions, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Crear otro hogar/ }));
    expect(actions.addHousehold).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
