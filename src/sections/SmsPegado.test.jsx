// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TransactionModal } from './Movimientos';

afterEach(() => cleanup());

const data = {
  currency: 'COP',
  members: [{ id: 'm1', name: 'Ana' }],
  accounts: [{ id: 'a1', name: 'Nómina', type: 'individual', ownerIds: ['m1'], paymentKind: 'ahorros' }],
  categories: [{ id: 'mer', name: 'Mercado', type: 'expense' }, { id: 'otr', name: 'Otros gastos', type: 'expense' }, { id: 'sal', name: 'Salario', type: 'income' }],
  transactions: [{ id: 't0', type: 'expense', accountId: 'a1', categoryId: 'mer', description: 'EXITO LAURELES', amount: 30000, date: '2026-09-01' }],
  templates: [],
};
const open = () => { fireEvent.click(screen.getByRole('button', { name: 'Pegar SMS o correo del banco' })); };
const paste = (text) => { fireEvent.change(screen.getByLabelText('Mensaje del banco'), { target: { value: text } }); fireEvent.click(screen.getByRole('button', { name: 'Leer mensaje' })); };

describe('Pegar SMS del banco en el formulario', () => {
  it('lee un gasto: llena monto, comercio, fecha y sugiere la categoría con el historial', () => {
    render(<TransactionModal data={data} actions={{ userId: 'm1' }} onClose={() => {}} />);
    open();
    paste('Bancolombia: Compraste $45.000 en EXITO LAURELES con tu T.Deb *1234 el 21/09/2026 a las 14:32.');
    expect(screen.getByDisplayValue('45000')).toBeTruthy();
    expect(screen.getByDisplayValue('EXITO LAURELES')).toBeTruthy();
    expect(screen.getByDisplayValue('2026-09-21')).toBeTruthy();
    expect(screen.getByDisplayValue('Mercado')).toBeTruthy(); // ya había un gasto igual en Mercado
    expect(screen.getByText(/Leí: tipo, monto, comercio, fecha/)).toBeTruthy();
  });

  it('un ingreso cambia el formulario a Ingreso', () => {
    render(<TransactionModal data={data} actions={{ userId: 'm1' }} onClose={() => {}} />);
    open();
    paste('Nequi: Recibiste $50.000 de JUAN PEREZ. Tu saldo es $80.000.');
    expect(screen.getByDisplayValue('50000')).toBeTruthy();
    expect(screen.getByDisplayValue('Salario')).toBeTruthy(); // la única categoría de ingreso
  });

  it('sin monto avisa y no toca el formulario', () => {
    render(<TransactionModal data={data} actions={{ userId: 'm1' }} onClose={() => {}} />);
    open();
    paste('Tu clave de acceso vence pronto');
    expect(screen.getByText(/No encontré un monto/)).toBeTruthy();
  });

  it('un movimiento que viene de otra pantalla no ofrece pegar SMS', () => {
    render(<TransactionModal data={data} payload={{ source: 'quick', type: 'expense', amount: 5, date: '2026-09-01' }} actions={{ userId: 'm1' }} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Pegar SMS o correo del banco' })).toBeNull();
  });
});
