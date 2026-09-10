import React, { useState } from 'react';
import { Landmark, Trash2 } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, IconButton, Modal, Field, MemberChip } from '../ui/primitives';
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

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Cuentas</p>
        <PrimaryButton onClick={() => setModal({ type: 'account' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nueva</PrimaryButton>
      </div>
      <div className="flex flex-col gap-3">
        {data.accounts.map((a) => (
          <Card key={a.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div style={{ width: 34, height: 34, borderRadius: 10, background: a.type === 'shared' ? T.tealSoft : T.goldSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Landmark size={16} color={a.type === 'shared' ? T.teal : T.gold} />
                </div>
                <div>
                  <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{a.name}</p>
                  <p style={{ fontSize: 11, color: T.inkSoft }}>{a.type === 'shared' ? 'Compartida' : 'Individual'} · {a.ownerIds.map((id) => data.members.find((m) => m.id === id)?.name).join(', ')}</p>
                </div>
              </div>
              <IconButton icon={Trash2} variant="danger" onClick={() => removeAccount(a.id)} confirmMessage={`¿Eliminar la cuenta "${a.name}"? Los movimientos ya registrados en ella no se borrarán.`} label="Eliminar cuenta" />
            </div>
            <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 18, color: T.ink }} className="mt-2">{formatMoney(balanceOf(a), currency)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AccountModal({ data, actions, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('individual');
  const [ownerIds, setOwnerIds] = useState([data.members[0]?.id]);
  const [initialBalance, setInitialBalance] = useState('');
  const [saving, setSaving] = useState(false);
  function toggle(id) { setOwnerIds((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id])); }
  async function save() {
    if (!name.trim() || !ownerIds.length) return;
    setSaving(true);
    try {
      await actions.addAccount({ name: name.trim(), type, ownerIds, initialBalance: parseFloat(initialBalance) || 0 });
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title="Nueva cuenta" onClose={onClose}>
      <Field label="Nombre de la cuenta">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cuenta de ahorros" />
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
      <Field label="Saldo inicial (opcional)">
        <input style={inputStyle} type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0" />
      </Field>
      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Si la cuenta ya tiene dinero, regístralo aquí — se guarda como un ingreso inicial.</p>
      <PrimaryButton full onClick={save}>{saving ? 'Creando…' : 'Crear cuenta'}</PrimaryButton>
    </Modal>
  );
}
