import React, { useState } from 'react';
import { Bell, Trash2, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, IconButton, Modal, Field, MemberChip, EmptyState } from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { daysUntil, todayISO } from '../lib/finance';

const FREQUENCY_LABEL = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', anual: 'Anual' };

export function Obligaciones({ data, actions, setModal }) {
  const currency = data.currency;
  const sorted = [...data.obligations].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-1">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Obligaciones</p>
        <PrimaryButton onClick={() => setModal({ type: 'obligation' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nueva</PrimaryButton>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Pagos que no se te pueden olvidar — arriendo, servicios, suscripciones. Te avisamos y, al tocar el aviso, queda listo para registrar el gasto.
      </p>

      {sorted.length === 0 && (
        <EmptyState icon={<Bell size={36} color={T.teal} />} title="Sin obligaciones" subtitle="Agrega un pago recurrente para que te avisemos antes de que se te pase." />
      )}

      <div className="flex flex-col gap-3">
        {sorted.map((o) => {
          const owner = o.ownerMemberId ? data.members.find((m) => m.id === o.ownerMemberId) : null;
          const cat = data.categories.find((c) => c.id === o.categoryId);
          const dias = daysUntil(o.nextDueDate);
          const overdue = dias < 0;
          return (
            <Card key={o.id} style={{ opacity: o.enabled ? 1 : 0.55 }}>
              <div className="flex items-start justify-between">
                <div>
                  <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{o.name}</p>
                  <div className="flex items-center flex-wrap gap-1" style={{ fontSize: 11, color: T.inkSoft }}>
                    {owner ? <MemberChip member={owner} size={14} /> : <span>Todo el hogar</span>}
                    <span>· {FREQUENCY_LABEL[o.frequency] || o.frequency}{cat ? ` · ${cat.name}` : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <IconButton icon={o.enabled ? ToggleRight : ToggleLeft} onClick={() => actions.setObligationEnabled(o.id, !o.enabled)} label={o.enabled ? 'Pausar' : 'Reactivar'} />
                  <IconButton icon={Pencil} onClick={() => setModal({ type: 'obligation', payload: o })} label="Editar" />
                  <IconButton icon={Trash2} variant="danger" onClick={() => actions.removeObligation(o.id)} confirmMessage={`¿Eliminar la obligación "${o.name}"?`} label="Eliminar obligación" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 15, color: T.ink }}>
                  {o.amount == null ? 'Monto variable' : formatMoney(o.amount, currency)}
                </span>
                <span style={{ fontSize: 11.5, color: overdue ? T.danger : T.inkSoft, fontFamily: FONT_BODY, fontWeight: overdue ? 600 : 400 }}>
                  {overdue ? `Venció · ${formatDate(o.nextDueDate)}` : dias === 0 ? 'Hoy' : `${formatDate(o.nextDueDate)} · en ${dias} día${dias === 1 ? '' : 's'}`}
                </span>
              </div>
              {o.note && <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1.5">{o.note}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function ObligationModal({ data, actions, payload, onClose }) {
  const editing = !!payload?.id;
  const expenseCats = data.categories.filter((c) => c.type === 'expense');
  const [name, setName] = useState(payload?.name || '');
  const [ownerMemberId, setOwnerMemberId] = useState(payload?.ownerMemberId || '');
  const [amount, setAmount] = useState(payload?.amount != null ? String(payload.amount) : '');
  const [categoryId, setCategoryId] = useState(payload?.categoryId || '');
  const [accountId, setAccountId] = useState(payload?.accountId || '');
  const [frequency, setFrequency] = useState(payload?.frequency || 'mensual');
  const [nextDueDate, setNextDueDate] = useState(payload?.nextDueDate || todayISO());
  const [timeOfDay, setTimeOfDay] = useState(payload?.timeOfDay || '09:00');
  const [note, setNote] = useState(payload?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const timezone = payload?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function save() {
    if (!name.trim() || !nextDueDate) { setError('Falta el nombre o la fecha.'); return; }
    setSaving(true); setError('');
    const o = {
      name: name.trim(), ownerMemberId: ownerMemberId || null,
      amount: amount === '' ? null : parseFloat(amount),
      categoryId: categoryId || null, accountId: accountId || null,
      frequency, nextDueDate, timeOfDay, timezone, note: note.trim(), enabled: payload?.enabled !== false,
    };
    try {
      if (editing) await actions.updateObligation(payload.id, o);
      else await actions.addObligation(o);
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo guardar la obligación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? 'Editar obligación' : 'Nueva obligación'} onClose={onClose}>
      <Field label="Nombre">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Arriendo" />
      </Field>
      <Field label="Para quién">
        <select style={inputStyle} value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
          <option value="">Todo el hogar</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>Solo {m.name}</option>)}
        </select>
      </Field>
      <Field label="Monto (vacío = variable, ej. servicios públicos)">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Monto variable" />
      </Field>
      <Field label="Frecuencia">
        <select style={inputStyle} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
          <option value="semanal">Semanal</option>
          <option value="quincenal">Quincenal</option>
          <option value="mensual">Mensual</option>
          <option value="anual">Anual</option>
        </select>
      </Field>
      <Field label="Próximo recordatorio">
        <input style={inputStyle} type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
      </Field>
      <Field label="Hora (tu zona horaria detectada es esta)">
        <input style={inputStyle} type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
      </Field>
      <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Zona horaria: <span style={{ fontFamily: FONT_MONO }}>{timezone}</span></p>
      <Field label="Categoría (opcional, para prellenar el gasto)">
        <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Sin categoría</option>
          {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Cuenta (opcional, para prellenar el gasto)">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Sin cuenta</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Nota (opcional)">
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Pagar antes del día 5" />
      </Field>
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear obligación'}</PrimaryButton>
    </Modal>
  );
}
