// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EstrategiaDeuda } from './EstrategiaDeuda';
import { SaludFinanciera } from './SaludFinanciera';

afterEach(() => cleanup());

const payments = (cuota) => [{ installmentNumber: 1, paid: false, capital: cuota - 20000, interest: 20000, total: cuota, balanceAfter: 0 }];
const data = {
  currency: 'COP',
  categories: [{ id: 'sal', type: 'income', nature: 'operativo' }, { id: 'mer', type: 'expense', nature: 'operativo' }],
  accounts: [{ id: 'a1', name: 'Ahorros', paymentKind: 'ahorros' }],
  budgets: [],
  creditsWithPayments: [
    { credit: { id: 'k1', name: 'Libranza', currency: 'COP', annualRate: 30, principal: 2000000, status: 'activo' }, payments: [{ installmentNumber: 1, paid: false, capital: 150000, interest: 50000, total: 200000, balanceAfter: 1850000 }] },
    { credit: { id: 'k2', name: 'Carro', currency: 'COP', annualRate: 14, principal: 30000000, status: 'activo' }, payments: [{ installmentNumber: 1, paid: false, capital: 500000, interest: 350000, total: 850000, balanceAfter: 29500000 }] },
  ],
};

describe('EstrategiaDeuda', () => {
  it('sin créditos no muestra nada', () => {
    const { container } = render(<EstrategiaDeuda data={{ ...data, creditsWithPayments: [] }} />);
    expect(container.textContent).toBe('');
  });
  it('se despliega y compara avalancha, bola de nieve y solo cuotas con un extra', () => {
    render(<EstrategiaDeuda data={data} />);
    expect(screen.getByText(/Simula avalancha vs bola de nieve/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Estrategia para pagar tus deudas/ }));
    expect(screen.getByText('Solo pagando las cuotas')).toBeTruthy();
    expect(screen.getByText(/^Avalancha/)).toBeTruthy();
    expect(screen.getByText(/^Bola de nieve/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dinero extra al mes'), { target: { value: '300000' } });
    expect(screen.getAllByText(/Ahorras/).length).toBeGreaterThan(0);
  });
});

describe('SaludFinanciera', () => {
  const d = new Date();
  const monthAgo = (n) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 10)); return x.toISOString().slice(0, 10); };
  const tx = [1, 2, 3].flatMap((n) => [
    { id: `i${n}`, type: 'income', categoryId: 'sal', accountId: 'a1', memberId: 'm1', amount: 4000000, date: monthAgo(n) },
    { id: `e${n}`, type: 'expense', categoryId: 'mer', accountId: 'a1', memberId: 'm1', amount: 3000000, date: monthAgo(n) },
  ]);
  it('sin datos pide registrar un mes completo', () => {
    render(<SaludFinanciera data={{ ...data, creditsWithPayments: [] }} transactions={[]} />);
    expect(screen.getByText(/al menos un mes completo/)).toBeTruthy();
  });
  it('con datos muestra el puntaje, el nivel y el detalle de los indicadores', () => {
    render(<SaludFinanciera data={{ ...data, creditsWithPayments: [] }} transactions={tx} />);
    expect(screen.getByText(/\/100/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ver cómo se calcula/ }));
    expect(screen.getByText('Tasa de ahorro')).toBeTruthy();
    expect(screen.getByText('Fondo de emergencia')).toBeTruthy();
    expect(screen.getByText('Carga de deuda')).toBeTruthy();
  });
});
