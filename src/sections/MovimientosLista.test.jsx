// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Movimientos } from './Movimientos';

afterEach(() => cleanup());

const data = {
  currency: 'COP', members: [{ id: 'm1', name: 'Ana', color: '#2F6E68' }],
  accounts: [{ id: 'a1', name: 'Nómina', type: 'individual', ownerIds: ['m1'], paymentKind: 'ahorros' }],
  categories: [{ id: 'c1', name: 'Mercado', type: 'expense', icon: 'utensils' }, { id: 'c2', name: 'Salario', type: 'income', icon: 'briefcase' }],
  attachmentCounts: {},
};
const tx = (i, type = 'expense') => ({ id: `t${i}`, type, description: `Mov ${String(i).padStart(3, '0')}`, amount: 1000 + i, categoryId: type === 'income' ? 'c2' : 'c1', accountId: 'a1', memberId: 'm1', date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, recurring: false, version: 1 });
const many = [...Array.from({ length: 110 }, (_, i) => tx(i)), ...Array.from({ length: 20 }, (_, i) => tx(200 + i, 'income'))];
const setup = () => render(<Movimientos data={data} actions={{}} visibleTransactions={many} setModal={() => {}} />);
const rows = () => document.querySelectorAll('button[aria-label="Editar movimiento"]').length;

describe('Movimientos — lista por páginas', () => {
  it('muestra 50 y pide más de a 50', () => {
    setup();
    expect(rows()).toBe(50);
    expect(screen.getByRole('status').textContent).toBe('Mostrando 50 de 130');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar 50 más' }));
    expect(rows()).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar 30 más' }));
    expect(rows()).toBe(130);
    expect(screen.queryByRole('status')).toBeNull(); // ya se ven todos
  });
  it('cambiar de filtro vuelve a la primera página', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar 50 más' }));
    expect(rows()).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Ingresos' }));
    expect(rows()).toBe(20);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(rows()).toBe(50);
  });
  it('una lista corta no muestra el botón', () => {
    render(<Movimientos data={data} actions={{}} visibleTransactions={many.slice(0, 10)} setModal={() => {}} />);
    expect(rows()).toBe(10);
    expect(screen.queryByRole('button', { name: /Mostrar/ })).toBeNull();
  });
});
