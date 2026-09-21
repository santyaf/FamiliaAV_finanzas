// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ImportarExtractos } from './ImportarExtractos';

afterEach(() => cleanup());

const data = {
  currency: 'COP',
  members: [{ id: 'm1', name: 'Ana' }],
  accounts: [{ id: 'a1', name: 'Ahorros', type: 'individual', ownerIds: ['m1'] }],
  categories: [
    { id: 'mer', name: 'Mercado', type: 'expense' }, { id: 'otr', name: 'Otros gastos', type: 'expense' },
    { id: 'sal', name: 'Salario', type: 'income' },
  ],
  transactions: [
    { id: 't0', type: 'expense', accountId: 'a1', date: '2026-09-01', amount: 4500, description: 'Café Juan Valdez', categoryId: 'mer' },
  ],
};
const CSV = [
  'Extracto de cuenta',
  'Fecha;Descripción;Valor;Saldo',
  '01/09/2026;Café Juan Valdez;-4.500;95.500',
  '02/09/2026;Compra Éxito Laureles;-45.000;50.500',
  '03/09/2026;Nómina septiembre;3.000.000;3.050.500',
  '31/02/2026;Fila mala;-100;0',
].join('\n');

function toReview() {
  fireEvent.change(screen.getByLabelText('Texto del extracto'), { target: { value: CSV } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisar movimientos' }));
}

describe('ImportarExtractos (prueba de humo)', () => {
  it('sin filas pide un archivo o texto', () => {
    render(<ImportarExtractos data={data} actions={{ userId: 'm1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/No encontré filas/)).toBeTruthy();
  });

  it('detecta el encabezado y las columnas, y marca duplicados y filas inválidas', () => {
    render(<ImportarExtractos data={data} actions={{ userId: 'm1' }} />);
    fireEvent.change(screen.getByLabelText('Texto del extracto'), { target: { value: CSV } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText(/Paso 2 de 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revisar movimientos' }));
    expect(screen.getByText(/Paso 3 de 3/)).toBeTruthy();
    expect(screen.getByText('Ya registrado')).toBeTruthy();
    expect(screen.getByText(/Fecha no válida/)).toBeTruthy();
    // el duplicado y la fila mala quedan sin seleccionar: 2 de 4
    expect(screen.getByText(/de 4 seleccionados/).textContent).toMatch(/2/);
  });

  it('sugiere la categoría con lo ya registrado e importa solo lo seleccionado', async () => {
    const importTransactions = vi.fn().mockResolvedValue(2);
    render(<ImportarExtractos data={data} actions={{ userId: 'm1', importTransactions }} />);
    toReview();
    expect(screen.getByLabelText('Categoría fila 1').value).toBe('mer'); // misma descripción que un movimiento existente
    expect(screen.getByLabelText('Categoría fila 2').value).toBe('otr'); // sin pistas: "Otros gastos"
    expect(screen.getByLabelText('Categoría fila 3').value).toBe('sal');
    fireEvent.click(screen.getByRole('button', { name: 'Importar 2 movimientos' }));
    await waitFor(() => expect(importTransactions).toHaveBeenCalledTimes(1));
    const arg = importTransactions.mock.calls[0][0];
    expect(arg.accountId).toBe('a1');
    expect(arg.memberId).toBe('m1');
    expect(arg.rows).toEqual([
      { date: '2026-09-02', type: 'expense', amount: 45000, description: 'Compra Éxito Laureles', categoryId: 'otr' },
      { date: '2026-09-03', type: 'income', amount: 3000000, description: 'Nómina septiembre', categoryId: 'sal' },
    ]);
    expect(await screen.findByText('Importación lista')).toBeTruthy();
  });

  it('se puede incluir un duplicado a mano y cambiar su categoría', async () => {
    const importTransactions = vi.fn().mockResolvedValue(3);
    render(<ImportarExtractos data={data} actions={{ userId: 'm1', importTransactions }} />);
    toReview();
    fireEvent.click(screen.getByLabelText('Incluir fila 1'));
    fireEvent.change(screen.getByLabelText('Categoría fila 1'), { target: { value: 'otr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Importar 3 movimientos' }));
    await waitFor(() => expect(importTransactions).toHaveBeenCalled());
    expect(importTransactions.mock.calls[0][0].rows[0]).toMatchObject({ date: '2026-09-01', categoryId: 'otr' });
  });

  it('si el servidor falla muestra el error y no da por hecha la importación', async () => {
    const importTransactions = vi.fn().mockRejectedValue(new Error('Sin conexión'));
    render(<ImportarExtractos data={data} actions={{ userId: 'm1', importTransactions }} />);
    toReview();
    fireEvent.click(screen.getByRole('button', { name: 'Importar 2 movimientos' }));
    expect(await screen.findByText('Sin conexión')).toBeTruthy();
    expect(screen.queryByText('Importación lista')).toBeNull();
  });
});
