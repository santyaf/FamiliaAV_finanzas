// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
import { Hijos } from './Hijos';

afterEach(() => cleanup());

const kid = { id: 'k1', name: 'Sofía', birthDate: '2018-03-01', color: '#5B7FA6', archived: false, allowanceAmount: 20000, allowanceFrequency: 'semanal', allowanceNextDate: '2099-01-01', allowanceAccountId: 'a1', allowancePayerId: 'me' };
const baseStore = () => ({
  kids: [kid, { ...kid, id: 'k2', name: 'Tomás', archived: true }],
  ledger: [
    { id: 'l1', kidId: 'k1', date: '2026-09-07', amount: 20000, kind: 'mesada', note: 'Mesada', transactionId: 't1', createdAt: '1' },
    { id: 'l2', kidId: 'k1', date: '2026-09-10', amount: 50000, kind: 'regalo', note: 'Abuela', transactionId: null, createdAt: '2' },
    { id: 'l3', kidId: 'k1', date: '2026-09-12', amount: -15000, kind: 'gasto', note: 'Helado', transactionId: null, createdAt: '3' },
  ],
  tasks: [{ id: 'tk1', kidId: 'k1', title: 'Tender la cama', reward: 2000 }],
  goals: [{ id: 'g1', kidId: 'k1', name: 'Patineta', targetAmount: 40000, achievedAt: null }, { id: 'g2', kidId: 'k1', name: 'Bicicleta', targetAmount: 400000, achievedAt: null }],
});
const data = { currency: 'COP', accounts: [{ id: 'a1', name: 'Nómina' }], members: [{ id: 'me', name: 'Ana' }] };
const mk = (store = baseStore()) => ({
  userId: 'me',
  loadKids: vi.fn().mockResolvedValue(store),
  saveKid: vi.fn().mockResolvedValue(), setKidArchived: vi.fn().mockResolvedValue(), deleteKid: vi.fn().mockResolvedValue(),
  addKidEntry: vi.fn().mockResolvedValue(), deleteKidEntry: vi.fn().mockResolvedValue(),
  addKidTask: vi.fn().mockResolvedValue(), removeKidTask: vi.fn().mockResolvedValue(),
  addKidGoal: vi.fn().mockResolvedValue(), removeKidGoal: vi.fn().mockResolvedValue(), completeKidGoal: vi.fn().mockResolvedValue(),
  payKidReward: vi.fn().mockResolvedValue(), payKidAllowanceNow: vi.fn().mockResolvedValue(),
});
const open = async (actions = mk()) => {
  render(<Hijos data={data} actions={actions} />);
  fireEvent.click(await screen.findByText('Sofía', { exact: false }));
  return actions;
};

describe('Hijos y mesada — lista', () => {
  it('muestra cada niño con su saldo y su próxima mesada; los archivados quedan aparte', async () => {
    render(<Hijos data={data} actions={mk()} />);
    expect(await screen.findByText(/Sofía/)).toBeTruthy();
    expect(screen.getByText(/Mesada cada semana/)).toBeTruthy();
    expect(screen.getByText(/¡Alcanzó una meta!/)).toBeTruthy(); // Patineta: 55.000 ≥ 40.000
    expect(screen.queryByText(/Tomás/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ver archivados/ }));
    expect(screen.getByText(/Tomás/)).toBeTruthy();
  });
  it('sin niños invita a crear el primero', async () => {
    render(<Hijos data={data} actions={mk({ kids: [], ledger: [], tasks: [], goals: [] })} />);
    expect(await screen.findByText('Aún no hay perfiles')).toBeTruthy();
  });
  it('crear un perfil con mesada envía los datos', async () => {
    const actions = mk({ kids: [], ledger: [], tasks: [], goals: [] });
    render(<Hijos data={data} actions={actions} />);
    fireEvent.click(await screen.findByRole('button', { name: /Agregar hijo o hija/ }));
    fireEvent.change(screen.getByPlaceholderText('Ej. Sofía'), { target: { value: 'Mateo' } });
    fireEvent.change(screen.getByLabelText('Monto de la mesada'), { target: { value: '15000' } });
    fireEvent.change(screen.getByLabelText('Cuenta de la mesada'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(actions.saveKid).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mateo', allowanceAmount: 15000, allowanceFrequency: 'semanal', allowanceAccountId: 'a1', allowancePayerId: 'me' })));
  });
  it('pide el nombre', async () => {
    const actions = mk({ kids: [], ledger: [], tasks: [], goals: [] });
    render(<Hijos data={data} actions={actions} />);
    fireEvent.click(await screen.findByRole('button', { name: /Agregar hijo o hija/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText('Escribe el nombre.')).toBeTruthy();
    expect(actions.saveKid).not.toHaveBeenCalled();
  });
});

describe('Hijos y mesada — detalle', () => {
  it('muestra el saldo, lo recibido y lo gastado, y el libro con saldos', async () => {
    await open();
    expect(screen.getByText('Ha recibido', { exact: false }).textContent).toMatch(/70\.000/);
    expect(screen.getByText(/Helado/)).toBeTruthy();
    expect(screen.getByText(/Abuela/)).toBeTruthy();
  });
  it('registrar un regalo; un gasto mayor al saldo se rechaza', async () => {
    const actions = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar dinero' }));
    fireEvent.change(screen.getByLabelText('Tipo de movimiento'), { target: { value: 'gasto' } });
    fireEvent.change(screen.getByLabelText('Monto'), { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText(/no tiene tanto/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tipo de movimiento'), { target: { value: 'regalo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(actions.addKidEntry).toHaveBeenCalledWith(expect.objectContaining({ kidId: 'k1', amount: 999999, kind: 'regalo' })));
  });
  it('pagar la mesada ahora y marcar una tarea como cumplida', async () => {
    const actions = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Pagar mesada ahora' }));
    await waitFor(() => expect(actions.payKidAllowanceNow).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1' })));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar cumplida: Tender la cama' }));
    await waitFor(() => expect(actions.payKidReward).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1' }), expect.objectContaining({ id: 'tk1', reward: 2000 })));
  });
  it('celebra la meta alcanzada y permite marcarla como comprada', async () => {
    const actions = await open();
    expect(screen.getByText('¡Sofía lo logró!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ya lo compró' }));
    await waitFor(() => expect(actions.completeKidGoal).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1', name: 'Patineta' })));
    expect(screen.getByText(/faltan/)).toBeTruthy(); // la bicicleta sigue en camino
  });
  it('agregar una tarea y una meta', async () => {
    const actions = await open();
    fireEvent.change(screen.getByLabelText('Nombre de la tarea'), { target: { value: 'Sacar la basura' } });
    fireEvent.change(screen.getByLabelText('Premio de la tarea'), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tarea' }));
    await waitFor(() => expect(actions.addKidTask).toHaveBeenCalledWith('k1', { title: 'Sacar la basura', reward: 1500 }));
    fireEvent.change(screen.getByLabelText('Nombre de la meta'), { target: { value: 'Libro' } });
    fireEvent.change(screen.getByLabelText('Valor de la meta'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar meta' }));
    await waitFor(() => expect(actions.addKidGoal).toHaveBeenCalledWith('k1', { name: 'Libro', targetAmount: 30000 }));
  });
  it('un movimiento ligado a un gasto de las cuentas no se borra desde aquí', async () => {
    await open();
    expect(screen.getAllByRole('button', { name: 'Quitar este movimiento' })).toHaveLength(2); // regalo y gasto, no la mesada
  });
});
