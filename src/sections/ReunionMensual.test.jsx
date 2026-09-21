// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ReunionMensual } from './ReunionMensual';

afterEach(() => cleanup());

// el componente abre por defecto el mes anterior si hoy es día 10 o menos, y el actual si no
const today = new Date().toISOString().slice(0, 10);
const prevKey = (k) => { const [y, m] = k.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const monthKey = Number(today.slice(8, 10)) <= 10 ? prevKey(today.slice(0, 7)) : today.slice(0, 7);
const before = prevKey(monthKey);

const data = {
  currency: 'COP',
  categories: [{ id: 'sal', name: 'Salario', type: 'income', nature: 'operativo' }, { id: 'mer', name: 'Mercado', type: 'expense', nature: 'operativo' }],
  accounts: [{ id: 'a1', name: 'Nómina', type: 'individual', ownerIds: ['m1'] }],
  budgets: [{ id: 'b1', categoryId: 'mer', limit: 500000, scope: 'household' }],
  goals: [{ id: 'g1', name: 'Viaje', targetAmount: 3000000, currentAmount: 600000 }],
  transactions: [
    { id: 'i1', type: 'income', categoryId: 'sal', accountId: 'a1', memberId: 'm1', amount: 4000000, date: `${monthKey}-02` },
    { id: 'e1', type: 'expense', categoryId: 'mer', accountId: 'a1', memberId: 'm1', amount: 700000, date: `${monthKey}-05`, description: 'Mercado del mes' },
    { id: 'e0', type: 'expense', categoryId: 'mer', accountId: 'a1', memberId: 'm1', amount: 300000, date: `${before}-05` },
  ],
};
const mkActions = (over = {}) => ({
  loadMonthlyReview: vi.fn().mockImplementation(async (k) => (k === before ? [{ id: 'old', text: 'Cocinar más en casa', done: false }] : [])),
  saveMonthlyDecisions: vi.fn().mockResolvedValue(),
  ...over,
});

describe('ReunionMensual (prueba de humo)', () => {
  it('recorre los pasos: resumen, categorías, presupuestos y metas, logros y alertas', () => {
    render(<ReunionMensual data={data} actions={mkActions()} />);
    expect(screen.getByText(/Paso 1 de 5/)).toBeTruthy();
    expect(screen.getByText('Ingresos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Gasto por categoría')).toBeTruthy();
    expect(screen.getByText('Mercado del mes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText(/se pasaron/)).toBeTruthy(); // 700.000 de 500.000
    expect(screen.getByText('Viaje')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Lo que salió bien')).toBeTruthy();
    expect(screen.getByText(/Se pasaron del presupuesto de Mercado/)).toBeTruthy();
  });

  it('decisiones: muestra las del mes anterior, agrega una y la guarda', async () => {
    const actions = mkActions();
    render(<ReunionMensual data={data} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paso 5: Decisiones' }));
    expect(await screen.findByText('Cocinar más en casa')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Nueva decisión'), { target: { value: 'Bajar domicilios' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar decisión' }));
    await waitFor(() => expect(actions.saveMonthlyDecisions).toHaveBeenCalledTimes(1));
    const [key, list] = actions.saveMonthlyDecisions.mock.calls[0];
    expect(key).toBe(monthKey);
    expect(list.map((d) => d.text)).toEqual(['Bajar domicilios']);
    expect(await screen.findByText('Bajar domicilios')).toBeTruthy();
  });

  it('marcar cumplida una decisión del mes pasado la guarda en ese mes', async () => {
    const actions = mkActions();
    render(<ReunionMensual data={data} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paso 5: Decisiones' }));
    const box = await screen.findByRole('checkbox');
    fireEvent.click(box);
    await waitFor(() => expect(actions.saveMonthlyDecisions).toHaveBeenCalled());
    const [key, list] = actions.saveMonthlyDecisions.mock.calls[0];
    expect(key).toBe(before);
    expect(list[0].done).toBe(true);
  });

  it('un mes sin movimientos lo dice en vez de mostrar ceros', () => {
    render(<ReunionMensual data={{ ...data, transactions: [] }} actions={mkActions()} />);
    expect(screen.getByText(/No hay ingresos ni gastos registrados/)).toBeTruthy();
  });

  it('si no se pueden cargar las decisiones muestra el error', async () => {
    const actions = mkActions({ loadMonthlyReview: vi.fn().mockRejectedValue(new Error('Sin conexión')) });
    render(<ReunionMensual data={data} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paso 5: Decisiones' }));
    expect(await screen.findByText('Sin conexión')).toBeTruthy();
  });
});
