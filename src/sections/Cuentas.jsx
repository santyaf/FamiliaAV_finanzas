import React, { useState } from 'react';
import { Trash2, Pencil } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, IconButton, Modal, Field, MemberChip, PaymentKindIcon, PAYMENT_KIND_LABEL, PAYMENT_KIND_OPTIONS } from '../ui/primitives';
import { formatMoney } from '../lib/format';

export function Cuentas({ data, actions, setModal }) {
  const currency = data.currency;
  function balanceOf(acc) {
    let total = 0;
    data.transactions.forEach((t) => {
      if (t.type === 'income' && t.accountId === acc.id) total += t.amount;
      else if (t.type === 'expense' && t.accountId === acc.id) total -= t.amount;
      else if (t.type === 'transfer') {
        if (t.goalId) {
          // aporte/retiro de objetivo: solo afecta la cuenta de origen
          if (t.accountId === acc.id) total += t.transferDirection === 'withdraw' ? t.amount : -t.amount;
        } else {
          // transferencia entre integrantes: sale de la cuenta origen, entra a la de destino
          if (t.accountId === acc.id) total -= t.amount;
          if (t.toAccountId === acc.id) total += t.amount;
        }
      }
    });
    return total;
  }
  function removeAccount(id) { actions.removeAccount(id); }

  // Disponible (o gastado, para tarjeta de crédito) por medio de pago —
  // agrupa las cuentas por payment_kind y suma su saldo.
  const kindsInUse = PAYMENT_KIND_OPTIONS.filter((k) => data.accounts.some((a) => (a.paymentKind || 'otro') === k));

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Cuentas</p>
        <PrimaryButton onClick={() => setModal({ type: 'account' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nueva</PrimaryButton>
      </div>

      {kindsInUse.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
          {kindsInUse.map((k) => {
            const total = data.accounts.filter((a) => (a.paymentKind || 'otro') === k).reduce((s, a) => s + balanceOf(a), 0);
            const isCredit = k === 'tarjeta_credito';
            return (
              <div key={k} className="flex-shrink-0 rounded-xl px-3 py-2" style={{ background: T.surface, border: `1px solid ${T.border}`, minWidth: 128 }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <PaymentKindIcon kind={k} size={13} color={T.inkSoft} />
                  <span style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{isCredit ? 'Gastado en' : 'Disponible en'} {PAYMENT_KIND_LABEL[k].toLowerCase()}</span>
                </div>
                <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 14, color: T.ink }}>{formatMoney(isCredit ? Math.abs(total) : total, currency)}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {data.accounts.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div style={{ width: 34, height: 34, borderRadius: 10, background: a.type === 'shared' ? T.tealSoft : T.goldSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PaymentKindIcon kind={a.paymentKind} size={16} color={a.type === 'shared' ? T.teal : T.gold} />
                </div>
                <div>
                  <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{a.name}</p>
                  <p style={{ fontSize: 11, color: T.inkSoft }}>{PAYMENT_KIND_LABEL[a.paymentKind || 'otro']} · {a.type === 'shared' ? 'Compartida' : 'Individual'} · {a.ownerIds.map((id) => data.members.find((m) => m.id === id)?.name).join(', ')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <IconButton icon={Pencil} onClick={() => setModal({ type: 'account', payload: a })} label="Editar cuenta" />
                <IconButton icon={Trash2} variant="danger" onClick={() => removeAccount(a.id)} confirmMessage={`¿Eliminar la cuenta "${a.name}"? Los movimientos ya registrados en ella no se borrarán.`} label="Eliminar cuenta" />
              </div>
            </div>
            <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 18, color: T.ink }} className="mt-2">{formatMoney(balanceOf(a), currency)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AccountModal({ data, actions, payload, onClose }) {
  const editing = !!payload?.id;
  const [name, setName] = useState(payload?.name || '');
  const [type, setType] = useState(payload?.type || 'individual');
  const [paymentKind, setPaymentKind] = useState(payload?.paymentKind || 'otro');
  const [ownerIds, setOwnerIds] = useState(payload?.ownerIds || [data.members[0]?.id]);
  const [initialBalance, setInitialBalance] = useState('');
  const [saving, setSaving] = useState(false);
  function toggle(id) { setOwnerIds((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id])); }
  async function save() {
    if (!name.trim() || !ownerIds.length) return;
    setSaving(true);
    try {
      if (editing) {
        await actions.updateAccount(payload.id, { name: name.trim(), type, paymentKind, ownerIds });
      } else {
        await actions.addAccount({ name: name.trim(), type, paymentKind, ownerIds, initialBalance: parseFloat(initialBalance) || 0 });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={editing ? 'Editar cuenta' : 'Nueva cuenta'} onClose={onClose}>
      <Field label="Nombre de la cuenta">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cuenta de ahorros" />
      </Field>
      <Field label="Medio de pago">
        <select style={inputStyle} value={paymentKind} onChange={(e) => setPaymentKind(e.target.value)}>
          <option value="efectivo">Efectivo</option>
          <option value="debito">Tarjeta débito</option>
          <option value="ahorros">Cuenta de ahorros</option>
          <option value="tarjeta_credito">Tarjeta de crédito</option>
          <option value="otro">Otro</option>
        </select>
      </Field>
      <Field label="Tipo">
        <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="individual">Individual</option>
          <option value="shared">Compartida</option>
        </select>
      </Field>
      <Field label="Integrantes asociados">
        <div className="flex flex-col gap-1.5">
          {data.members.map((m) => (
            <label key={m.id} className="flex items-center gap-2">
              <input type="checkbox" checked={ownerIds.includes(m.id)} onChange={() => toggle(m.id)} />
              <MemberChip member={m} size={18} />
            </label>
          ))}
        </div>
      </Field>
      {!editing && (
        <>
          <Field label="Saldo inicial (opcional)">
            <input style={inputStyle} type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0" />
          </Field>
          <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Si la cuenta ya tiene dinero, regístralo aquí — se guarda como un ingreso inicial.</p>
        </>
      )}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cuenta'}</PrimaryButton>
    </Modal>
  );
}
