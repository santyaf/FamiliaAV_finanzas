// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { RefinanceModal, PayInstallmentModal, CreditModal, EditCreditModal } from './Creditos';
import { generateSchedule } from '../lib/amortization';

afterEach(() => cleanup());

const data = {
  currency: 'COP',
  members: [{ id: 'm1', name: 'Ana' }],
  accounts: [{ id: 'a1', name: 'Nómina', type: 'individual', ownerIds: ['m1'] }],
  categories: [{ id: 'deu', name: 'Deudas y préstamos', type: 'expense' }],
};

const credit = {
  id: 'c1', name: 'Libranza Banco X', creditType: 'libre_inversion', currency: 'COP', principal: 6000000, annualRate: 24,
  termMonths: 6, amortizationSystem: 'frances', insuranceMonthly: 0, startDate: '2026-01-01', status: 'activo',
  ownerMemberId: 'm1', accountId: 'a1', paymentSource: 'libranza', payrollEmployer: 'Mi empresa', payrollDay: 30, autoRegister: true,
};
const rows = generateSchedule({ principal: 6000000, annualRate: 24, termMonths: 6, system: 'frances', insuranceMonthly: 0, firstDueDate: '2026-01-30' })
  .map((r, i) => ({ ...r, id: `p${i}`, paid: i < 2 }));

describe('Créditos (prueba de humo)', () => {
  it('RefinanceModal muestra el antes y el después y llama a refinanceCredit', async () => {
    const refinanceCredit = vi.fn().mockResolvedValue({});
    const onDone = vi.fn();
    render(<RefinanceModal data={data} actions={{ refinanceCredit }} payload={{ credit, payments: rows }} onClose={() => {}} onDone={onDone} />);
    expect(screen.getByText('Retanquear / rediferir')).toBeTruthy();
    expect(screen.getByText('Valor de la cuota')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar retanqueo' }));
    await waitFor(() => expect(refinanceCredit).toHaveBeenCalledTimes(1));
    const [, , opts] = refinanceCredit.mock.calls[0];
    expect(opts).toMatchObject({ kind: 'retanqueo', topUp: 1000000, termMonths: 4 });
    expect(opts.annualRate).toBeCloseTo(24, 6);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('RefinanceModal exige dinero nuevo en un retanqueo', () => {
    const refinanceCredit = vi.fn();
    render(<RefinanceModal data={data} actions={{ refinanceCredit }} payload={{ credit, payments: rows }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar retanqueo' }));
    expect(refinanceCredit).not.toHaveBeenCalled();
    expect(screen.getByText('Indica cuánto dinero nuevo recibes.')).toBeTruthy();
  });

  it('RefinanceModal en modo rediferido no pide dinero nuevo', async () => {
    const refinanceCredit = vi.fn().mockResolvedValue({});
    render(<RefinanceModal data={data} actions={{ refinanceCredit }} payload={{ credit, payments: rows }} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Rediferir / reestructurar'));
    fireEvent.change(screen.getByDisplayValue('4'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar rediferido' }));
    await waitFor(() => expect(refinanceCredit).toHaveBeenCalledTimes(1));
    expect(refinanceCredit.mock.calls[0][2]).toMatchObject({ kind: 'rediferido', topUp: 0, termMonths: 10 });
  });

  it('PayInstallmentModal de una libranza habla de descuento de nómina y pasa las opciones', async () => {
    const markInstallmentPaid = vi.fn().mockResolvedValue({});
    const installment = rows.find((r) => !r.paid);
    render(<PayInstallmentModal data={data} actions={{ markInstallmentPaid }} payload={{ credit, installment }} onClose={() => {}} />);
    expect(screen.getAllByText(/Descuento de nómina/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Registrar descuento' }));
    await waitFor(() => expect(markInstallmentPaid).toHaveBeenCalledTimes(1));
    expect(markInstallmentPaid.mock.calls[0][5]).toMatchObject({ libranza: true });
  });

  it('CreditModal ofrece la libranza y pide el día de descuento', () => {
    const createCredit = vi.fn();
    render(<CreditModal data={data} actions={{ createCredit, userId: 'm1' }} onClose={() => {}} />);
    expect(screen.getAllByText(/Libranza — la cuota se descuenta de mi nómina/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('radio')[1]);
    expect(screen.getByText(/Día del mes en que se descuenta de la nómina/)).toBeTruthy();
    expect(screen.getByText('Cuenta donde cae tu salario')).toBeTruthy();
  });

  it('EditCreditModal carga los datos de la libranza', () => {
    render(<EditCreditModal data={data} actions={{ userId: 'm1' }} payload={{ credit, payments: rows }} onClose={() => {}} />);
    expect(screen.getByDisplayValue('Mi empresa')).toBeTruthy();
    expect(screen.getByDisplayValue('30')).toBeTruthy();
  });
});
