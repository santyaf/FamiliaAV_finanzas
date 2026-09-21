// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TransactionModal } from './Movimientos';

afterEach(() => cleanup());

const data = {
  currency: 'COP',
  members: [{ id: 'm1', name: 'Ana' }],
  accounts: [{ id: 'a1', name: 'Nómina', type: 'individual', ownerIds: ['m1'], paymentKind: 'ahorros' }],
  categories: [{ id: 'mer', name: 'Mercado', type: 'expense' }, { id: 'gas', name: 'Transporte', type: 'expense' }, { id: 'sal', name: 'Salario', type: 'income' }],
  transactions: [],
  templates: [
    { id: 't1', name: 'Mercado D1', type: 'expense', description: 'D1', amount: 85000, categoryId: 'mer', accountId: 'a1' },
    { id: 't2', name: 'Gasolina', type: 'expense', description: '', amount: null, categoryId: 'gas', accountId: 'a1' },
  ],
};

describe('Plantillas en el formulario de movimientos', () => {
  it('una plantilla llena el formulario', () => {
    render(<TransactionModal data={data} actions={{ userId: 'm1' }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Gasolina/ }));
    expect(screen.getByDisplayValue('Gasolina')).toBeTruthy(); // descripción = nombre
    expect(screen.getByDisplayValue('Transporte')).toBeTruthy();
  });

  it('el rayo registra de un toque las que traen monto, y solo esas', async () => {
    const addTransaction = vi.fn().mockResolvedValue({ id: 'x', queued: false });
    const onClose = vi.fn();
    render(<TransactionModal data={data} actions={{ userId: 'm1', addTransaction }} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: /Registrar Gasolina ahora/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Registrar Mercado D1 ahora/ }));
    await waitFor(() => expect(addTransaction).toHaveBeenCalledTimes(1));
    expect(addTransaction.mock.calls[0][0]).toMatchObject({ type: 'expense', amount: 85000, categoryId: 'mer', accountId: 'a1', memberId: 'm1', description: 'D1' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('modo editar: se puede borrar una plantilla', () => {
    const deleteTemplate = vi.fn();
    render(<TransactionModal data={data} actions={{ userId: 'm1', deleteTemplate }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar plantilla Gasolina' }));
    expect(deleteTemplate).toHaveBeenCalledWith('t2');
  });

  it('guardar como plantilla crea la plantilla con lo del formulario', async () => {
    const addTransaction = vi.fn().mockResolvedValue({ id: 'x', queued: false });
    const addTemplate = vi.fn().mockResolvedValue();
    render(<TransactionModal data={{ ...data, templates: [] }} actions={{ userId: 'm1', addTransaction, addTemplate }} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '18000' } });
    fireEvent.click(screen.getByLabelText('Guardar como plantilla'));
    fireEvent.change(screen.getByLabelText('Nombre de la plantilla'), { target: { value: 'Almuerzo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar movimiento' }));
    await waitFor(() => expect(addTemplate).toHaveBeenCalledTimes(1));
    expect(addTemplate.mock.calls[0][0]).toMatchObject({ name: 'Almuerzo', type: 'expense', amount: 18000, householdWide: false });
  });

  it('un movimiento que viene del asistente no ofrece plantillas', () => {
    render(<TransactionModal data={data} payload={{ source: 'quick', type: 'expense', amount: 5000, categoryId: 'mer', accountId: 'a1', date: '2026-09-01' }} actions={{ userId: 'm1' }} onClose={() => {}} />);
    expect(screen.queryByText('Plantillas')).toBeNull();
    expect(screen.queryByLabelText('Guardar como plantilla')).toBeNull();
  });
});
