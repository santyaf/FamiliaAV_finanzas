// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { CardSummary, CardPayModal, CardPlansModal, RedeferModal, DeferralFields, emptyDeferral, deferralToPlan } from './Tarjetas';

afterEach(() => cleanup());

const card = { id: 'tc', name: 'Visa Oro', type: 'individual', ownerIds: ['m1'], paymentKind: 'tarjeta_credito', creditLimit: 5000000, statementDay: 15, paymentDay: 30, cardRate: 26 };
const bank = { id: 'bk', name: 'Nómina', type: 'individual', ownerIds: ['m1'], paymentKind: 'ahorros' };
const plan = {
  id: 'p1', accountId: 'tc', description: 'Nevera', principal: 1200000, annualRate: 0, installments: 12,
  firstBillDate: '2026-10-15', billedCount: 2, status: 'activo',
};
const data = {
  currency: 'COP',
  members: [{ id: 'm1', name: 'Ana' }],
  accounts: [bank, card],
  categories: [],
  transactions: [
    { id: 't1', type: 'income', accountId: 'bk', memberId: 'm1', amount: 3000000, date: '2026-09-01' },
    { id: 't2', type: 'expense', accountId: 'tc', memberId: 'm1', amount: 1500000, date: '2026-09-05' },
  ],
  cardPlans: [plan],
};

describe('Tarjetas (prueba de humo)', () => {
  it('CardSummary muestra deuda, disponible y abre el pago', () => {
    const setModal = vi.fn();
    render(<CardSummary account={card} balance={-1500000} data={data} setModal={setModal} />);
    expect(screen.getByText(/Disponible/)).toBeTruthy();
    expect(screen.getByText(/Próximo corte/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pagar tarjeta' }));
    expect(setModal).toHaveBeenCalledWith({ type: 'cardPay', payload: { account: card } });
    expect(screen.getByRole('button', { name: /Compras diferidas \(1\)/ })).toBeTruthy();
  });

  it('CardPayModal registra la transferencia hacia la tarjeta desde otra cuenta', async () => {
    const payCreditCard = vi.fn().mockResolvedValue();
    const onClose = vi.fn();
    render(<CardPayModal data={data} actions={{ payCreditCard }} payload={{ account: card }} onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '400000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago' }));
    await waitFor(() => expect(payCreditCard).toHaveBeenCalledTimes(1));
    expect(payCreditCard.mock.calls[0][0]).toMatchObject({ cardAccountId: 'tc', fromAccountId: 'bk', amount: 400000 });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('DeferralFields muestra la primera cuota estimada', () => {
    const Wrapper = () => {
      const [v, setV] = React.useState({ ...emptyDeferral(card), enabled: true, installments: '10', rateValue: '0' });
      return <DeferralFields account={card} amount="1000000" date="2026-09-10" value={v} onChange={setV} currency="COP" />;
    };
    render(<Wrapper />);
    expect(screen.getByText(/Primera cuota en el corte/)).toBeTruthy();
    expect(screen.getByText(/Intereses totales/)).toBeTruthy();
  });

  it('deferralToPlan valida las cuotas y calcula el primer corte', () => {
    expect(deferralToPlan({ ...emptyDeferral(card), enabled: false }, '2026-09-10', card)).toEqual({ plan: null });
    expect(deferralToPlan({ ...emptyDeferral(card), enabled: true, installments: '1' }, '2026-09-10', card).error).toBeTruthy();
    const ok = deferralToPlan({ ...emptyDeferral(card), enabled: true, installments: '6', rateValue: '26' }, '2026-09-20', card);
    expect(ok.plan).toMatchObject({ installments: 6, firstBillDate: '2026-10-15' });
    expect(ok.plan.annualRate).toBeCloseTo(26, 6);
  });

  it('CardPlansModal lista los planes y ofrece rediferir', () => {
    const setModal = vi.fn();
    render(<CardPlansModal data={data} actions={{}} payload={{ account: card }} onClose={() => {}} setModal={setModal} />);
    expect(screen.getByText('Nevera')).toBeTruthy();
    expect(screen.getByText(/Cuota 3 de 12/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Rediferir / abonar' }));
    expect(setModal).toHaveBeenCalledWith({ type: 'redeferPlan', payload: { plan, account: card } });
  });

  it('RedeferModal llama a redeferCardPlan con el plazo nuevo', async () => {
    const redeferCardPlan = vi.fn().mockResolvedValue({});
    render(<RedeferModal data={data} actions={{ redeferCardPlan }} payload={{ plan, account: card }} onClose={() => {}} />);
    expect(screen.getByText('Valor de la cuota')).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambio' }));
    await waitFor(() => expect(redeferCardPlan).toHaveBeenCalledTimes(1));
    expect(redeferCardPlan.mock.calls[0][1]).toMatchObject({ installments: 20, extraPayment: 0 });
  });
});
