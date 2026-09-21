// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TransactionModal, EditTransactionModal, diffTransactions } from './Movimientos';

afterEach(() => cleanup());

const data = {
  currency: 'COP', householdName: 'Casa',
  members: [{ id: 'me', name: 'Ana' }, { id: 'b', name: 'Beto' }],
  accounts: [
    { id: 'sh', name: 'Compartida', type: 'shared', ownerIds: ['me', 'b'], paymentKind: 'ahorros' },
    { id: 'own', name: 'Mi nómina', type: 'individual', ownerIds: ['me'], paymentKind: 'ahorros' },
  ],
  categories: [{ id: 'reg', name: 'Regalos', type: 'expense', nature: 'operativo' }],
  transactions: [], templates: [], spendRequests: [], approvalThreshold: null,
};
const mk = () => ({ userId: 'me', addTransaction: vi.fn().mockResolvedValue({ id: 'tx1' }), updateTransaction: vi.fn().mockResolvedValue() });
const amountInput = () => document.querySelector('input[inputmode="decimal"], input[type="number"]');
const chooseAccount = (id) => fireEvent.change(screen.getByDisplayValue(/Compartida|Mi nómina/), { target: { value: id } });

describe('Movimiento sorpresa — nuevo', () => {
  it('se ofrece solo en cuentas compartidas', () => {
    render(<TransactionModal data={data} actions={mk()} onClose={() => {}} />);
    expect(screen.getByLabelText(/Sorpresa: ocultarlo/)).toBeTruthy(); // la primera cuenta es la compartida
    chooseAccount('own');
    expect(screen.queryByLabelText(/Sorpresa: ocultarlo/)).toBeNull(); // lo individual ya es privado
  });
  it('ocultarlo sin fecha lo guarda como oculto siempre', async () => {
    const actions = mk();
    render(<TransactionModal data={data} actions={actions} onClose={() => {}} />);
    fireEvent.change(amountInput(), { target: { value: '150000' } });
    fireEvent.click(screen.getByLabelText(/Sorpresa: ocultarlo/));
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(actions.addTransaction).toHaveBeenCalledWith(expect.objectContaining({ privateUntil: '9999-12-31', accountId: 'sh' })));
  });
  it('con una fecha futura la guarda; con una pasada avisa y no guarda', async () => {
    const actions = mk();
    render(<TransactionModal data={data} actions={actions} onClose={() => {}} />);
    fireEvent.change(amountInput(), { target: { value: '150000' } });
    fireEvent.click(screen.getByLabelText(/Sorpresa: ocultarlo/));
    fireEvent.change(screen.getByLabelText('Mostrarlo el día'), { target: { value: '2020-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText(/Elige una fecha futura/)).toBeTruthy();
    expect(actions.addTransaction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Mostrarlo el día'), { target: { value: '2099-12-25' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(actions.addTransaction).toHaveBeenCalledWith(expect.objectContaining({ privateUntil: '2099-12-25' })));
  });
  it('sin marcarlo, el movimiento es normal', async () => {
    const actions = mk();
    render(<TransactionModal data={data} actions={actions} onClose={() => {}} />);
    fireEvent.change(amountInput(), { target: { value: '150000' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(actions.addTransaction).toHaveBeenCalledWith(expect.objectContaining({ privateUntil: null })));
  });
});

describe('Movimiento sorpresa — edición', () => {
  const original = { id: 't1', type: 'expense', description: 'Regalo', amount: 90000, categoryId: 'reg', accountId: 'sh', memberId: 'me', date: '2026-09-01', privateUntil: '2099-12-25', createdBy: 'me', isShared: false, participants: null };
  it('quien lo creó lo ve marcado y puede mostrarlo', async () => {
    const actions = mk();
    render(<EditTransactionModal data={data} actions={actions} payload={original} onClose={() => {}} />);
    const box = screen.getByLabelText(/Sorpresa: ocultarlo/);
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: /Revisar|Guardar|Continuar/ }));
    expect(await screen.findByText('Oculto a los demás hasta')).toBeTruthy(); // aparece en el resumen de cambios
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambios' }));
    await waitFor(() => expect(actions.updateTransaction).toHaveBeenCalledWith(original, expect.objectContaining({ privateUntil: null })));
  });
  it('otra persona no ve la opción', () => {
    render(<EditTransactionModal data={data} actions={mk()} payload={{ ...original, privateUntil: null, createdBy: 'b' }} onClose={() => {}} />);
    expect(screen.queryByLabelText(/Sorpresa: ocultarlo/)).toBeNull();
  });
  it('el resumen de cambios describe la fecha', () => {
    const d = diffTransactions({ ...original, privateUntil: null }, { ...original, privateUntil: '2099-12-25' }, data);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ field: 'privateUntil', before: '—' });
    expect(diffTransactions({ ...original, privateUntil: '9999-12-31' }, { ...original, privateUntil: null }, data)[0].before).toBe('Siempre');
  });
});
