// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Calendario } from './Calendario';

afterEach(() => cleanup());

const today = new Date().toISOString().slice(0, 10);
const monthKey = today.slice(0, 7);
const data = {
  currency: 'COP',
  categories: [{ id: 'viv', name: 'Vivienda' }],
  accounts: [{ id: 'tc', name: 'Visa', paymentKind: 'tarjeta_credito', statementDay: 10, paymentDay: 25 }],
  goals: [], assets: [], obligations: [],
  creditsWithPayments: [{ credit: { id: 'k1', name: 'Libranza', currency: 'COP' }, payments: [{ installmentNumber: 1, dueDate: `${monthKey}-20`, total: 250000, paid: false }] }],
  transactions: [{ id: 't1', type: 'expense', recurring: true, frequency: 'mensual', date: `${monthKey}-05`, amount: 900000, categoryId: 'viv', description: 'Arriendo' }],
};

describe('Calendario (prueba de humo)', () => {
  it('muestra el mes, los totales y los eventos del día elegido', () => {
    render(<Calendario data={data} />);
    expect(screen.getByText('Calendario financiero')).toBeTruthy();
    expect(screen.getByText(/Sale/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^5 de .*1 eventos$/ }));
    expect(screen.getByText('Arriendo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^20 de .*1 eventos$/ }));
    expect(screen.getByText('Libranza · cuota 1')).toBeTruthy();
  });
  it('las tarjetas muestran su corte y su pago', () => {
    render(<Calendario data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /^10 de /}));
    expect(screen.getByText('Corte Visa')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^25 de /}));
    expect(screen.getByText('Pagar Visa')).toBeTruthy();
  });
  it('se navega al mes siguiente y al anterior', () => {
    render(<Calendario data={data} />);
    const title = () => screen.getByText(/^[a-záéíóú]+ \d{4}$/i).textContent;
    const first = title();
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(title()).not.toBe(first);
    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(title()).toBe(first);
  });
});
