// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
import { Aprobaciones, SpendRequestModal } from './Aprobaciones';
import { TransactionModal } from './Movimientos';

afterEach(() => cleanup());

const members = [{ id: 'me', name: 'Ana' }, { id: 'b', name: 'Beto' }, { id: 'c', name: 'Caro' }];
const base = {
  currency: 'COP', members, householdName: 'Casa',
  accounts: [{ id: 'a1', name: 'Nómina', type: 'individual', ownerIds: ['me'], paymentKind: 'ahorros' }],
  categories: [{ id: 'hog', name: 'Hogar', type: 'expense' }, { id: 'otr', name: 'Otros gastos', type: 'expense' }],
  transactions: [], templates: [], approvalThreshold: null,
  spendRequests: [
    { id: 'r1', requestedBy: 'b', title: 'Nevera nueva', amount: 2_500_000, categoryId: 'hog', accountId: 'a1', note: 'La actual ya no enfría', status: 'pending', createdAt: '2026-09-20T10:00:00Z' },
    { id: 'r2', requestedBy: 'me', title: 'Viaje a la costa', amount: 3_000_000, status: 'pending', createdAt: '2026-09-19T10:00:00Z' },
    { id: 'r3', requestedBy: 'me', title: 'Televisor', amount: 1_800_000, categoryId: 'hog', accountId: 'a1', status: 'approved', createdAt: '2026-09-18T10:00:00Z' },
    { id: 'r4', requestedBy: 'c', title: 'Bicicleta', amount: 900_000, status: 'rejected', createdAt: '2026-09-10T10:00:00Z' },
  ],
  spendVotes: [{ requestId: 'r2', memberId: 'b', vote: 'approve', comment: null }, { requestId: 'r4', memberId: 'me', vote: 'reject', comment: 'Ahora no' }],
};
const mkActions = (over = {}) => ({
  userId: 'me', myRole: 'admin',
  voteSpendRequest: vi.fn().mockResolvedValue(), cancelSpendRequest: vi.fn().mockResolvedValue(), createSpendRequest: vi.fn().mockResolvedValue(),
  setApprovalThreshold: vi.fn().mockResolvedValue(), markSpendRequestDone: vi.fn().mockResolvedValue(), addTransaction: vi.fn().mockResolvedValue({ id: 'tx1' }),
  ...over,
});
const setup = (data = base, actions = mkActions()) => { const setModal = vi.fn(); render(<Aprobaciones data={data} actions={actions} setModal={setModal} />); return { actions, setModal }; };
const amountInput = () => document.querySelector('input[inputmode="decimal"], input[type="number"]');

describe('Aprobaciones', () => {
  it('agrupa: lo que espera mi respuesta, lo aprobado por registrar, mis abiertas y el historial', () => {
    setup();
    expect(screen.getByText('Esperan tu respuesta')).toBeTruthy();
    expect(screen.getByText('Nevera nueva')).toBeTruthy();
    expect(screen.getByText('Aprobadas: falta registrar el gasto')).toBeTruthy();
    expect(screen.getByText('Tus solicitudes abiertas')).toBeTruthy();
    expect(screen.getByText('Historial')).toBeTruthy();
    expect(screen.getByText('Bicicleta')).toBeTruthy();
    expect(screen.getByText(/1 de 2 aprobaciones · falta Caro/)).toBeTruthy();
  });
  it('aprobar o rechazar envía el voto con el comentario', async () => {
    const { actions } = setup();
    fireEvent.change(screen.getByLabelText('Comentario sobre Nevera nueva'), { target: { value: 'Sí, hacía falta' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Aprobar' })[0]);
    await waitFor(() => expect(actions.voteSpendRequest).toHaveBeenCalledWith('r1', 'approve', 'Sí, hacía falta'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Rechazar' })[0]);
    await waitFor(() => expect(actions.voteSpendRequest).toHaveBeenCalledWith('r1', 'reject', 'Sí, hacía falta'));
  });
  it('una solicitud propia abierta se puede cancelar', async () => {
    const { actions } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar solicitud' }));
    await waitFor(() => expect(actions.cancelSpendRequest).toHaveBeenCalledWith('r2'));
  });
  it('registrar una solicitud aprobada abre el formulario con sus datos', () => {
    const { setModal } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar el gasto' }));
    expect(setModal).toHaveBeenCalledWith({ type: 'transaction', payload: expect.objectContaining({ source: 'request', requestId: 'r3', description: 'Televisor', amount: 1_800_000, categoryId: 'hog', accountId: 'a1', memberId: 'me' }) });
  });
  it('el administrador cambia el umbral; quitarlo lo deja vacío', async () => {
    const { actions } = setup();
    fireEvent.change(screen.getByLabelText('Umbral de gasto grande'), { target: { value: '500000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(actions.setApprovalThreshold).toHaveBeenCalledWith(500000));
    fireEvent.change(screen.getByLabelText('Umbral de gasto grande'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(actions.setApprovalThreshold).toHaveBeenLastCalledWith(null));
  });
  it('quien no es administrador no edita el umbral', () => {
    setup({ ...base, approvalThreshold: 500000 }, mkActions({ myRole: 'member' }));
    expect(screen.queryByLabelText('Umbral de gasto grande')).toBeNull();
    expect(screen.getByText(/Lo cambia un administrador/)).toBeTruthy();
    expect(screen.getByText(/Desde/)).toBeTruthy();
  });
  it('en un hogar de una sola persona explica que hace falta alguien más', () => {
    setup({ ...base, members: [members[0]], spendRequests: [], spendVotes: [] });
    expect(screen.getByText('Necesitas a alguien más')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pedir visto bueno/ })).toBeNull();
  });
});

describe('SpendRequestModal', () => {
  it('pide título y monto antes de enviar', () => {
    const actions = mkActions();
    render(<SpendRequestModal data={base} actions={actions} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(screen.getByText(/Escribe qué quieres comprar/)).toBeTruthy();
    expect(actions.createSpendRequest).not.toHaveBeenCalled();
  });
  it('envía la solicitud y cierra', async () => {
    const actions = mkActions(); const onClose = vi.fn();
    render(<SpendRequestModal data={base} actions={actions} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('Ej. Nevera nueva'), { target: { value: 'Lavadora' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '2200000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    await waitFor(() => expect(actions.createSpendRequest).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lavadora', amount: 2200000 })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('gasto grande al registrar un movimiento', () => {
  const data = { ...base, approvalThreshold: 1_000_000 };
  it('avisa (sin bloquear) cuando el monto llega al umbral', () => {
    render(<TransactionModal data={data} actions={mkActions()} onClose={() => {}} />);
    expect(screen.queryByText(/llega al umbral/)).toBeNull();
    fireEvent.change(amountInput(), { target: { value: '1500000' } });
    expect(screen.getByText(/llega al umbral/)).toBeTruthy();
  });
  it('ofrece vincular una solicitud aprobada y la cierra al guardar', async () => {
    const actions = mkActions();
    render(<TransactionModal data={data} actions={actions} onClose={() => {}} />);
    fireEvent.change(amountInput(), { target: { value: '1800000' } });
    fireEvent.change(screen.getByLabelText('Vincular a una solicitud aprobada'), { target: { value: 'r3' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(actions.markSpendRequestDone).toHaveBeenCalledWith('r3', 'tx1'));
  });
  it('desde una solicitud aprobada la marca como registrada', async () => {
    const actions = mkActions();
    const payload = { source: 'request', requestId: 'r3', type: 'expense', description: 'Televisor', amount: 1_800_000, categoryId: 'hog', accountId: 'a1', memberId: 'me' };
    render(<TransactionModal data={data} actions={actions} payload={payload} onClose={() => {}} />);
    expect(screen.getByText(/El hogar aprobó "Televisor"/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(actions.markSpendRequestDone).toHaveBeenCalledWith('r3', 'tx1'));
  });
});
