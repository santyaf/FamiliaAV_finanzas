// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Informes } from './Informes';

afterEach(() => cleanup());

const today = new Date().toISOString().slice(0, 10);
const categories = [
  { id: 'sal', name: 'Salario', type: 'income', groupName: 'Ingresos laborales', nature: 'operativo' },
  { id: 'viv', name: 'Vivienda', type: 'expense', groupName: 'Vivienda y servicios', nature: 'operativo', isFixed: true },
  { id: 'deu', name: 'Deudas y préstamos', type: 'expense', groupName: 'Deudas', nature: 'financiamiento' },
];
const base = (overrides = {}) => ({
  currency: 'COP', householdName: 'Casa Prueba',
  members: [{ id: 'm1', name: 'Ana' }],
  accounts: [{ id: 'a1', name: 'Mi cuenta', type: 'individual', ownerIds: ['m1'] }],
  categories,
  transactions: [
    { id: 't1', type: 'income', categoryId: 'sal', accountId: 'a1', memberId: 'm1', amount: 3000000, date: today },
    { id: 't2', type: 'expense', categoryId: 'viv', accountId: 'a1', memberId: 'm1', amount: 900000, date: today },
    { id: 't3', type: 'expense', categoryId: 'deu', accountId: 'a1', memberId: 'm1', amount: 500000, date: today },
  ],
  ...overrides,
});
const actions = { userId: 'm1' };

describe('Informes (prueba de humo)', () => {
  it('muestra el estado de resultados personal con sus totales', () => {
    render(<Informes data={base()} actions={actions} />);
    expect(screen.getByText('Informes financieros')).toBeTruthy();
    expect(screen.getByText('RESULTADO DEL PERÍODO')).toBeTruthy();
    expect(screen.getByText('Ingresos laborales')).toBeTruthy();
    expect(screen.getByText('Pagos a capital de deudas')).toBeTruthy();
    expect(screen.getByRole('button', { name: /CSV/ })).toBeTruthy();
  });

  it('cambia al flujo de efectivo y confirma que cuadra con los saldos', () => {
    render(<Informes data={base()} actions={actions} />);
    fireEvent.click(screen.getAllByText('Flujo de efectivo')[0]);
    expect(screen.getByText('FLUJO NETO DEL PERÍODO')).toBeTruthy();
    expect(screen.getByText(/El flujo cuadra con los saldos/)).toBeTruthy();
  });

  it('avisa cuando no hay cuentas compartidas para el informe del hogar', () => {
    render(<Informes data={base()} actions={actions} />);
    fireEvent.click(screen.getByText('Hogar (cuentas compartidas)'));
    expect(screen.getByText('No hay cuentas compartidas')).toBeTruthy();
  });

  it('avisa cuando no hay cuentas individuales para el informe personal', () => {
    render(<Informes data={base({ accounts: [] })} actions={actions} />);
    expect(screen.getByText('No tienes cuentas individuales')).toBeTruthy();
  });

  it('cambia el período y el comparativo sin romperse', () => {
    render(<Informes data={base()} actions={actions} />);
    fireEvent.click(screen.getByText('Trimestral'));
    fireEvent.click(screen.getByText('Anual'));
    const compare = screen.getByRole('checkbox');
    fireEvent.click(compare);
    expect(screen.getByText('RESULTADO DEL PERÍODO')).toBeTruthy();
  });

  it('señala las categorías sin rubro', () => {
    const data = base({ categories: [...categories, { id: 'x', name: 'Suelta', type: 'expense', nature: 'operativo' }],
      transactions: [{ id: 't9', type: 'expense', categoryId: 'x', accountId: 'a1', memberId: 'm1', amount: 100, date: today }] });
    render(<Informes data={data} actions={actions} />);
    expect(screen.getByText(/Hay categorías sin rubro/)).toBeTruthy();
  });
});
