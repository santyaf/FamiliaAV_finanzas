import React, { useMemo } from 'react';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO } from '../ui/theme';
import { Card, MemberChip, EmptyState, PrimaryButton } from '../ui/primitives';
import { formatMoney } from '../lib/format';
import { computeBalances, simplifyDebts } from '../lib/finance';

export default function Conciliacion({ data, actions }) {
  const currency = data.currency;
  const balances = useMemo(() => computeBalances(data.transactions, data.members), [data.transactions, data.members]);
  const transfers = useMemo(() => simplifyDebts(balances), [balances]);

  function settle(transfer) {
    actions.addSettlement(transfer.from, transfer.to, transfer.amount);
  }

  const sharedExpensesCount = data.transactions.filter((t) => t.isShared).length;

  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-1">Conciliación de gastos compartidos</p>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Calculado a partir de {sharedExpensesCount} gasto(s) compartido(s). Muestra las transferencias mínimas para saldar cuentas entre integrantes.
      </p>

      <Card style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Balance individual</p>
        {data.members.map((m) => {
          const b = balances[m.id] || 0;
          return (
            <div key={m.id} className="flex items-center justify-between mb-2">
              <MemberChip member={m} />
              <span style={{ fontFamily: FONT_MONO, fontSize: 13.5, color: b > 0.5 ? T.teal : b < -0.5 ? T.danger : T.inkSoft }}>
                {b > 0.5 ? `Le deben ${formatMoney(b, currency)}` : b < -0.5 ? `Debe ${formatMoney(-b, currency)}` : 'En paz'}
              </span>
            </div>
          );
        })}
      </Card>

      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Transferencias sugeridas</p>
      {transfers.length === 0 && <EmptyState icon={<ArrowLeftRight size={32} color={T.teal} />} title="Todo saldado" subtitle="No hay deudas pendientes entre los integrantes por ahora." />}
      <div className="flex flex-col gap-2">
        {transfers.map((tr, i) => {
          const from = data.members.find((m) => m.id === tr.from);
          const to = data.members.find((m) => m.id === tr.to);
          return (
            <Card key={i}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MemberChip member={from} size={22} />
                  <ArrowRight size={14} color={T.inkSoft} />
                  <MemberChip member={to} size={22} />
                </div>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 14, color: T.ink }}>{formatMoney(tr.amount, currency)}</span>
              </div>
              <PrimaryButton full onClick={() => settle(tr)} style={{ marginTop: 10, fontSize: 13, padding: '8px' }}>Marcar como pagado</PrimaryButton>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
