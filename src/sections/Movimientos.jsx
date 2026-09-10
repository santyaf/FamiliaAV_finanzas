import React, { useState, useEffect } from 'react';
import {
  Repeat, Pencil, History, Trash2, ArrowRight, ArrowLeftRight, ChevronRight, Calendar,
  Info, List, PiggyBank,
} from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import {
  Card, PrimaryButton, GhostButton, IconButton, Modal, Field, MemberChip, EmptyState, CategoryIcon,
} from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { todayISO, computeIncomeShares, occurrencesInMonth, getNextOccurrence, daysUntil } from '../lib/finance';

export function Movimientos({ data, actions, visibleTransactions, setModal }) {
  const [filter, setFilter] = useState('todos'); // todos | income | expense | recurring | sporadic
  const currency = data.currency;

  const filtered = visibleTransactions.filter((t) => {
    if (t.type === 'settlement') return false;
    if (filter === 'income') return t.type === 'income';
    if (filter === 'expense') return t.type === 'expense';
    if (filter === 'recurring') return t.recurring;
    if (filter === 'sporadic') return !t.recurring;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  function removeTransaction(id) {
    actions.deleteTransaction(id);
  }

  return (
    <div className="pb-4">
      <GhostButton full onClick={() => setModal({ type: 'memberTransfer' })} style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <ArrowLeftRight size={14} /> Transferencia entre integrantes
      </GhostButton>
      <div className="flex gap-2 mb-4 overflow-x-auto pt-2">
        {[['todos', 'Todos'], ['income', 'Ingresos'], ['expense', 'Gastos'], ['recurring', 'Recurrentes'], ['sporadic', 'Esporádicos']].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className="flex-shrink-0 rounded-full px-3 py-1.5"
            style={{ background: filter === id ? T.ink : T.surface, border: `1px solid ${filter === id ? T.ink : T.border}` }}>
            <span style={{ fontSize: 12.5, color: filter === id ? '#fff' : T.inkSoft, fontFamily: FONT_BODY }}>{label}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && <EmptyState icon={<List size={36} color={T.teal} />} title="Sin movimientos" subtitle="No hay movimientos que coincidan con este filtro." />}

      <div className="flex flex-col gap-2">
        {filtered.map((t) => {
          if (t.type === 'transfer') {
            const member = data.members.find((m) => m.id === t.memberId);
            const account = data.accounts.find((a) => a.id === t.accountId);
            const isGoalTransfer = !!t.goalId;
            if (isGoalTransfer) {
              const isDeposit = t.transferDirection !== 'withdraw';
              return (
                <Card key={t.id}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5">
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: T.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PiggyBank size={18} color={T.amber} />
                      </div>
                      <div>
                        <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{t.description}</p>
                        <p style={{ fontSize: 11.5, color: T.inkSoft }}>Transferencia a objetivo · {formatDate(t.date)}{account ? ` · ${account.name}` : ''}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {member && <MemberChip member={member} size={18} />}
                          <span className="rounded-full px-2 py-0.5" style={{ background: T.amberSoft }}><span style={{ fontSize: 10, color: T.amber }}>No cuenta como gasto</span></span>
                        </div>
                      </div>
                    </div>
                    <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 14.5, color: T.amber }}>
                      {isDeposit ? '→' : '←'} {formatMoney(t.amount, currency)}
                    </span>
                  </div>
                </Card>
              );
            }
            // transferencia entre integrantes
            const toMember = data.members.find((m) => m.id === t.toMemberId);
            const toAccount = data.accounts.find((a) => a.id === t.toAccountId);
            return (
              <Card key={t.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2.5">
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: T.tealSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ArrowLeftRight size={18} color={T.teal} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{t.description || 'Transferencia entre integrantes'}</p>
                      <p style={{ fontSize: 11.5, color: T.inkSoft }}>{formatDate(t.date)}{account ? ` · ${account.name}` : ''}{toAccount ? ` → ${toAccount.name}` : ''}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {member && <MemberChip member={member} size={18} />}
                        <ArrowRight size={11} color={T.inkSoft} />
                        {toMember && <MemberChip member={toMember} size={18} />}
                        {t.settlesDebt && <span className="rounded-full px-2 py-0.5" style={{ background: T.tealSoft }}><span style={{ fontSize: 10, color: T.teal }}>Salda deuda</span></span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 14.5, color: T.teal }}>
                      {formatMoney(t.amount, currency)}
                    </span>
                    <IconButton icon={Trash2} variant="danger" onClick={() => removeTransaction(t.id)} confirmMessage="¿Eliminar esta transferencia? El dinero volverá al balance de quien la envió." label="Eliminar transferencia" />
                  </div>
                </div>
              </Card>
            );
          }
          const cat = data.categories.find((c) => c.id === t.categoryId);
          const member = data.members.find((m) => m.id === t.memberId);
          const account = data.accounts.find((a) => a.id === t.accountId);
          return (
            <Card key={t.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2.5">
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: t.type === 'income' ? T.tealSoft : T.coralSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>
                    <CategoryIcon icon={cat?.icon} size={18} color={t.type === 'income' ? T.teal : T.coral} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{t.description || cat?.name}</p>
                    <p style={{ fontSize: 11.5, color: T.inkSoft }}>{cat?.name} · {formatDate(t.date)}{account ? ` · ${account.name}` : ''}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {member && <MemberChip member={member} size={18} />}
                      {t.recurring && <span className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: T.goldSoft }}><Repeat size={10} color={T.gold} /><span style={{ fontSize: 10, color: T.gold }}>{t.frequency}</span></span>}
                      {t.isShared && <span className="rounded-full px-2 py-0.5" style={{ background: T.tealSoft }}><span style={{ fontSize: 10, color: T.teal }}>Compartido</span></span>}
                      {t.version > 1 && (
                        <button onClick={() => setModal({ type: 'history', payload: t })} className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: T.bg }}>
                          <History size={10} color={T.inkSoft} /><span style={{ fontSize: 10, color: T.inkSoft }}>Editado ({t.version - 1})</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 14.5, color: t.type === 'income' ? T.teal : T.coral }}>
                    {t.type === 'income' ? '+' : '-'}{formatMoney(t.amount, currency)}
                  </span>
                  <div className="flex items-center gap-2">
                    <IconButton icon={Pencil} onClick={() => setModal({ type: 'editTransaction', payload: t })} label="Editar movimiento" />
                    <IconButton icon={Trash2} variant="danger" onClick={() => removeTransaction(t.id)} confirmMessage="¿Eliminar este movimiento? Esta acción no se puede deshacer." label="Eliminar movimiento" />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


export function TransactionModal({ data, actions, payload, onClose }) {
  const [type, setType] = useState(payload?.type || 'expense');
  const [description, setDescription] = useState(payload?.description || '');
  const [amount, setAmount] = useState(payload?.amount ? String(payload.amount) : '');
  const [categoryId, setCategoryId] = useState(payload?.categoryId || '');
  const [accountId, setAccountId] = useState(payload?.accountId || data.accounts[0]?.id || '');
  const [memberId, setMemberId] = useState(payload?.memberId || data.members[0]?.id || '');
  const [date, setDate] = useState(payload?.date || todayISO());
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState('mensual');
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [participants, setParticipants] = useState(data.members.map((m) => m.id));
  const [splitMode, setSplitMode] = useState('equal'); // equal | custom | income
  const [customPercents, setCustomPercents] = useState({});

  const cats = data.categories.filter((c) => c.type === type);
  useEffect(() => { if (!categoryId && cats.length) setCategoryId(cats[0].id); }, [type]);

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !categoryId || !accountId || !memberId) return;
    let participantsData = null;
    if (type === 'expense' && isShared && participants.length) {
      let percents;
      if (splitMode === 'income') {
        percents = computeIncomeShares(data.transactions, participants);
      } else if (splitMode === 'custom') {
        const total = participants.reduce((s, id) => s + (parseFloat(customPercents[id]) || 0), 0) || 100;
        percents = Object.fromEntries(participants.map((id) => [id, ((parseFloat(customPercents[id]) || 0) / total) * 100]));
      } else {
        const eq = 100 / participants.length;
        percents = Object.fromEntries(participants.map((id) => [id, eq]));
      }
      participantsData = participants.map((id) => ({ memberId: id, share: amt * (percents[id] / 100) }));
    }
    const t = {
      type, description, amount: amt, categoryId, accountId, memberId, date,
      recurring, frequency: recurring ? frequency : null,
      isShared: type === 'expense' ? isShared : false,
      participants: participantsData,
    };
    setSaving(true);
    try {
      await actions.addTransaction(t);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function toggleParticipant(id) {
    setParticipants((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }

  return (
    <Modal title={payload?.source === 'quick' ? 'Revisa lo detectado' : 'Nuevo movimiento'} onClose={onClose}>
      {payload?.source === 'quick' && (
        <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.goldSoft }}>
          <Info size={15} color={T.gold} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>
            Esto se extrajo automáticamente{payload?.raw ? `: "${payload.raw}"` : ''}. Revisa y ajusta antes de guardar.
          </p>
        </div>
      )}
      <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
        <button onClick={() => setType('expense')} className="flex-1 rounded-lg py-2" style={{ background: type === 'expense' ? T.coral : 'transparent' }}>
          <span style={{ color: type === 'expense' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5 }}>Gasto</span>
        </button>
        <button onClick={() => setType('income')} className="flex-1 rounded-lg py-2" style={{ background: type === 'income' ? T.teal : 'transparent' }}>
          <span style={{ color: type === 'income' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5 }}>Ingreso</span>
        </button>
      </div>

      <Field label="Descripción (opcional)">
        <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Supermercado" />
      </Field>
      <Field label="Monto">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Categoría">
        <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Cuenta">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label={type === 'income' ? 'Recibido por' : 'Pagado por'}>
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha">
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        <span style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY }}>Es recurrente</span>
      </label>
      {recurring && (
        <Field label="Frecuencia">
          <select style={inputStyle} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="semanal">Semanal</option>
            <option value="quincenal">Quincenal</option>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
        </Field>
      )}

      {type === 'expense' && data.members.length > 1 && (
        <>
          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
            <span style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY }}>Gasto compartido entre integrantes</span>
          </label>
          {isShared && (
            <>
              <Field label="Se divide entre">
                <div className="flex flex-col gap-1.5">
                  {data.members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={participants.includes(m.id)} onChange={() => toggleParticipant(m.id)} />
                      <MemberChip member={m} size={18} />
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Cómo se reparte">
                <select style={inputStyle} value={splitMode} onChange={(e) => setSplitMode(e.target.value)}>
                  <option value="equal">Partes iguales (50/50 entre los seleccionados)</option>
                  <option value="custom">Porcentaje personalizado</option>
                  <option value="income">Proporcional a ingresos (promedio 3 meses)</option>
                </select>
              </Field>
              {splitMode === 'custom' && (
                <Field label="Porcentaje de cada integrante">
                  <div className="flex flex-col gap-2">
                    {participants.map((id) => {
                      const m = data.members.find((mm) => mm.id === id);
                      return (
                        <div key={id} className="flex items-center gap-2">
                          <div style={{ width: 90 }}><MemberChip member={m} size={18} /></div>
                          <input type="number" style={{ ...inputStyle, flex: 1 }} value={customPercents[id] ?? ''}
                            onChange={(e) => setCustomPercents({ ...customPercents, [id]: e.target.value })} placeholder="%" />
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1.5">Se ajusta automáticamente a que sume 100%, aunque no lo cuadres exacto.</p>
                </Field>
              )}
              {splitMode === 'income' && amount && (
                <div className="rounded-xl p-3 mb-4" style={{ background: T.bg }}>
                  {participants.map((id) => {
                    const m = data.members.find((mm) => mm.id === id);
                    const pct = computeIncomeShares(data.transactions, participants)[id];
                    return (
                      <div key={id} className="flex items-center justify-between mb-1">
                        <MemberChip member={m} size={18} />
                        <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink }}>{pct.toFixed(0)}% · {formatMoney((parseFloat(amount) || 0) * pct / 100, data.currency)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      <PrimaryButton full onClick={save} style={{ marginTop: 8 }}>{saving ? 'Guardando…' : 'Guardar movimiento'}</PrimaryButton>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* EDICIÓN DE MOVIMIENTOS — con confirmación e histórico                  */
/* ---------------------------------------------------------------------- */
const FIELD_LABELS = {
  type: 'Tipo', description: 'Descripción', amount: 'Monto', categoryId: 'Categoría',
  accountId: 'Cuenta', memberId: 'Integrante', date: 'Fecha', recurring: 'Recurrente',
  frequency: 'Frecuencia', isShared: 'Compartido',
};

export function describeValue(field, value, data) {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'type') return value === 'income' ? 'Ingreso' : 'Gasto';
  if (field === 'amount') return formatMoney(value, data.currency);
  if (field === 'categoryId') return data.categories.find((c) => c.id === value)?.name || value;
  if (field === 'accountId') return data.accounts.find((a) => a.id === value)?.name || value;
  if (field === 'memberId') return data.members.find((m) => m.id === value)?.name || value;
  if (field === 'date') return formatDate(value);
  if (field === 'recurring' || field === 'isShared') return value ? 'Sí' : 'No';
  return String(value);
}

export function diffTransactions(original, edited, data) {
  const fields = ['type', 'description', 'amount', 'categoryId', 'accountId', 'memberId', 'date', 'recurring', 'frequency', 'isShared'];
  return fields
    .filter((f) => String(original[f] ?? '') !== String(edited[f] ?? ''))
    .map((f) => ({ field: f, label: FIELD_LABELS[f], before: describeValue(f, original[f], data), after: describeValue(f, edited[f], data) }));
}

export function EditTransactionModal({ data, actions, payload: original, onClose }) {
  const [step, setStep] = useState('edit'); // edit | confirm
  const [type, setType] = useState(original.type);
  const [description, setDescription] = useState(original.description || '');
  const [amount, setAmount] = useState(String(original.amount));
  const [categoryId, setCategoryId] = useState(original.categoryId);
  const [accountId, setAccountId] = useState(original.accountId);
  const [memberId, setMemberId] = useState(original.memberId);
  const [date, setDate] = useState(original.date);
  const [recurring, setRecurring] = useState(!!original.recurring);
  const [frequency, setFrequency] = useState(original.frequency || 'mensual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cats = data.categories.filter((c) => c.type === type);

  const edited = {
    type, description, amount: parseFloat(amount) || 0, categoryId, accountId, memberId, date,
    recurring, frequency: recurring ? frequency : null,
    isShared: original.isShared, participants: original.participants,
  };
  const changes = diffTransactions(original, edited, data);

  function goToConfirm() {
    if (!edited.amount || edited.amount <= 0 || !categoryId || !accountId || !memberId) return;
    if (changes.length === 0) { onClose(); return; }
    setStep('confirm');
  }

  async function confirm() {
    setSaving(true); setError('');
    try {
      await actions.updateTransaction(original, edited);
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo guardar la edición.');
      setSaving(false);
    }
  }

  if (step === 'confirm') {
    return (
      <Modal title="Confirmar cambios" onClose={onClose}>
        <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
          Este movimiento ya existe y tiene historial. Revisa los cambios antes de guardarlos — quedarán registrados con tu nombre y la fecha de hoy.
        </p>
        <div className="flex flex-col gap-2 mb-5">
          {changes.map((c) => (
            <div key={c.field} className="rounded-xl p-3" style={{ background: T.bg }}>
              <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-1">{c.label}</p>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 13, color: T.danger, fontFamily: FONT_MONO, textDecoration: 'line-through' }}>{c.before}</span>
                <ArrowRight size={12} color={T.inkSoft} />
                <span style={{ fontSize: 13, color: T.teal, fontFamily: FONT_MONO, fontWeight: 600 }}>{c.after}</span>
              </div>
            </div>
          ))}
        </div>
        {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
        <div className="flex gap-2">
          <GhostButton onClick={() => setStep('edit')}>Volver</GhostButton>
          <PrimaryButton full onClick={confirm}>{saving ? 'Guardando…' : 'Confirmar cambios'}</PrimaryButton>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Editar movimiento" onClose={onClose}>
      <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
        <button onClick={() => setType('expense')} className="flex-1 rounded-lg py-2" style={{ background: type === 'expense' ? T.coral : 'transparent' }}>
          <span style={{ color: type === 'expense' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5 }}>Gasto</span>
        </button>
        <button onClick={() => setType('income')} className="flex-1 rounded-lg py-2" style={{ background: type === 'income' ? T.teal : 'transparent' }}>
          <span style={{ color: type === 'income' ? '#fff' : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5 }}>Ingreso</span>
        </button>
      </div>
      <Field label="Descripción (opcional)">
        <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Monto">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Categoría">
        <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Cuenta">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label={type === 'income' ? 'Recibido por' : 'Pagado por'}>
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha">
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
        <span style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY }}>Es recurrente</span>
      </label>
      {recurring && (
        <Field label="Frecuencia">
          <select style={inputStyle} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="semanal">Semanal</option>
            <option value="quincenal">Quincenal</option>
            <option value="mensual">Mensual</option>
            <option value="anual">Anual</option>
          </select>
        </Field>
      )}
      <PrimaryButton full onClick={goToConfirm} style={{ marginTop: 8 }}>Revisar cambios</PrimaryButton>
    </Modal>
  );
}

export function HistoryModal({ data, actions, payload: tx, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    actions.getTransactionHistory(tx.id).then(setEntries).catch((e) => setError(e.message));
  }, [tx.id]);

  const current = {
    type: tx.type, description: tx.description, amount: tx.amount, categoryId: tx.categoryId,
    accountId: tx.accountId, memberId: tx.memberId, date: tx.date, recurring: tx.recurring,
    frequency: tx.frequency, isShared: tx.isShared,
  };

  return (
    <Modal title="Historial de este movimiento" onClose={onClose}>
      <div className="rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
        <p style={{ fontSize: 11.5, color: T.teal, fontFamily: FONT_BODY }} className="mb-1">Estado actual</p>
        <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>{describeValue('description', current.description, data) !== '—' ? current.description : data.categories.find((c) => c.id === current.categoryId)?.name}</p>
        <p style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.ink }}>{formatMoney(current.amount, data.currency)} · {formatDate(current.date)}</p>
      </div>

      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      {!entries && !error && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Cargando historial…</p>}

      <div className="flex flex-col gap-3">
        {entries && entries.map((h, i) => {
          const nextState = i === 0 ? current : entries[i - 1].snapshot;
          const changes = diffTransactions(h.snapshot, nextState, data);
          return (
            <div key={h.id} className="rounded-xl p-3" style={{ border: `1px solid ${T.border}` }}>
              <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">
                Editado por <b>{h.editorName}</b> · {formatDate(h.editedAt.slice(0, 10))}
              </p>
              {changes.length === 0 ? (
                <p style={{ fontSize: 12, color: T.inkSoft }}>Sin cambios detectados en estos campos.</p>
              ) : changes.map((c) => (
                <div key={c.field} className="flex items-center gap-2 mb-1">
                  <span style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY, minWidth: 70 }}>{c.label}:</span>
                  <span style={{ fontSize: 12, color: T.danger, fontFamily: FONT_MONO, textDecoration: 'line-through' }}>{c.before}</span>
                  <ArrowRight size={11} color={T.inkSoft} />
                  <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_MONO }}>{c.after}</span>
                </div>
              ))}
            </div>
          );
        })}
        {entries && entries.length === 0 && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Este movimiento no tiene ediciones registradas.</p>}
      </div>
    </Modal>
  );
}
