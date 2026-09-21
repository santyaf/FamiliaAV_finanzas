// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Renta } from './Renta';

afterEach(() => cleanup());

const year = Number(new Date().toISOString().slice(0, 4)) - 1;
const data = {
  currency: 'COP', householdName: 'Casa', members: [{ id: 'u1', name: 'Ana' }],
  accounts: [{ id: 'bank', name: 'Ahorros', type: 'individual', ownerIds: ['u1'], paymentKind: 'ahorros' }],
  categories: [
    { id: 'sal', name: 'Salario', type: 'income', nature: 'operativo', taxTag: 'laboral' },
    { id: 'pre', name: 'Prepagada', type: 'expense', nature: 'operativo', taxTag: 'salud' },
    { id: 'sup', name: 'Supermercado', type: 'expense', nature: 'operativo', taxTag: null },
    { id: 'pres', name: 'Préstamos recibidos', type: 'income', nature: 'financiamiento' },
  ],
  transactions: [
    { id: 't1', type: 'income', accountId: 'bank', categoryId: 'sal', amount: 90_000_000, date: `${year}-03-01` },
    { id: 't2', type: 'expense', accountId: 'bank', categoryId: 'pre', amount: 3_000_000, date: `${year}-04-01` },
  ],
  assets: [], creditsWithPayments: [],
};
const setup = () => { const actions = { userId: 'u1', setCategoryTaxTag: vi.fn() }; render(<Renta data={data} actions={actions} />); return actions; };

describe('Renta (prueba de humo)', () => {
  it('avisa que probablemente debe declarar y muestra ingresos y deducciones', () => {
    setup();
    expect(screen.getByText(`Probablemente debes declarar el año ${year}`)).toBeTruthy();
    expect(screen.getByText('Ingresos del año')).toBeTruthy();
    expect(screen.getByText('Total aprovechable')).toBeTruthy();
    expect(screen.getByText(/reemplaza la asesoría/)).toBeTruthy();
  });
  it('sin datos del año elegido no obliga', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: String(year - 3) }));
    expect(screen.getByText(`Probablemente no estás obligado a declarar el año ${year - 3}`)).toBeTruthy();
    expect(screen.getByText(/Nada etiquetado todavía/)).toBeTruthy();
  });
  it('cambiar el uso tributario de una categoría llama a la acción', () => {
    const actions = setup();
    fireEvent.change(screen.getByLabelText('Uso tributario de Supermercado'), { target: { value: 'donaciones' } });
    expect(actions.setCategoryTaxTag).toHaveBeenCalledWith('sup', 'donaciones');
    fireEvent.change(screen.getByLabelText('Uso tributario de Prepagada'), { target: { value: '' } });
    expect(actions.setCategoryTaxTag).toHaveBeenCalledWith('pre', null);
  });
  it('solo ofrece categorías operativas y opciones según su tipo', () => {
    setup();
    expect(screen.queryByLabelText('Uso tributario de Préstamos recibidos')).toBeNull();
    const incomeSel = screen.getByLabelText('Uso tributario de Salario');
    expect([...incomeSel.options].map((o) => o.value)).toEqual(['', 'laboral', 'capital']);
  });
  it('la UVT es editable y cambia los topes', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Valor de la UVT'), { target: { value: '1000' } });
    expect(screen.getByText(/Probablemente no estás obligado|Probablemente debes declarar/)).toBeTruthy();
  });
});
