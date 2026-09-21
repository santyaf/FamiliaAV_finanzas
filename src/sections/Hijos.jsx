import React, { useCallback, useEffect, useState } from 'react';
import { Baby, Plus, ChevronLeft, PartyPopper, Trash2, Check, Target, Wallet, ListChecks, Pencil } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, Modal, PrimaryButton, GhostButton, Field, EmptyState, ProgressBar } from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { todayISO } from '../lib/finance';
import {
  ALLOWANCE_FREQUENCIES, LEDGER_KINDS, kidSummary, goalProgress, goalsToCelebrate, ledgerWithBalance, validateLedgerEntry, hasAllowance,
} from '../lib/kids';

const KID_COLORS = ['#5B7FA6', '#E0673F', '#4A9B6E', '#8E5B9F', '#B98A22', '#2F6E68'];
const frequencyLabel = (id) => ALLOWANCE_FREQUENCIES.find((f) => f.id === id)?.label.toLowerCase() || '';

function KidModal({ data, actions, kid, onClose, onSaved }) {
  const [name, setName] = useState(kid?.name || '');
  const [birthDate, setBirthDate] = useState(kid?.birthDate || '');
  const [color, setColor] = useState(kid?.color || KID_COLORS[0]);
  const [amount, setAmount] = useState(kid?.allowanceAmount ? String(kid.allowanceAmount) : '');
  const [frequency, setFrequency] = useState(kid?.allowanceFrequency || 'semanal');
  const [nextDate, setNextDate] = useState(kid?.allowanceNextDate || todayISO());
  const [accountId, setAccountId] = useState(kid?.allowanceAccountId || '');
  const [payerId, setPayerId] = useState(kid?.allowancePayerId || actions.userId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const amt = parseFloat(amount);

  async function save() {
    if (!name.trim()) { setError('Escribe el nombre.'); return; }
    setSaving(true); setError('');
    try {
      await actions.saveKid({ id: kid?.id, name, birthDate, color, allowanceAmount: amt > 0 ? amt : null, allowanceFrequency: frequency, allowanceNextDate: nextDate, allowanceAccountId: accountId, allowancePayerId: payerId });
      onSaved(); onClose();
    } catch (e) { setError(e.message || 'No se pudo guardar.'); } finally { setSaving(false); }
  }
  return (
    <Modal title={kid ? 'Editar perfil' : 'Nuevo hijo o hija'} onClose={onClose}>
      <Field label="Nombre"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Sofía" /></Field>
      <Field label="Fecha de nacimiento (opcional)"><input style={inputStyle} type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></Field>
      <Field label="Color">
        <div className="flex gap-2" role="radiogroup" aria-label="Color">
          {KID_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${c}`} onClick={() => setColor(c)} className="rounded-full"
              style={{ width: 32, height: 32, background: c, border: color === c ? `3px solid ${T.ink}` : `1px solid ${T.border}` }} />
          ))}
        </div>
      </Field>
      <div className="rounded-xl p-3 mb-4" style={{ background: T.bg }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: T.ink }} className="mb-2">Mesada (opcional)</p>
        <Field label="Monto"><input style={inputStyle} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ej. 20000 (vacío = sin mesada)" aria-label="Monto de la mesada" /></Field>
        {amt > 0 && (
          <>
            <Field label="Cada cuánto">
              <select style={inputStyle} value={frequency} onChange={(e) => setFrequency(e.target.value)} aria-label="Frecuencia de la mesada">
                {ALLOWANCE_FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </Field>
            <Field label="Próxima mesada"><input style={inputStyle} type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} aria-label="Fecha de la próxima mesada" /></Field>
            <Field label="Se paga desde (cuenta)">
              <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta de la mesada">
                <option value="">Solo anotar en la alcancía (sin gasto en una cuenta)</option>
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            {accountId && (
              <Field label="Quién la paga">
                <select style={inputStyle} value={payerId} onChange={(e) => setPayerId(e.target.value)} aria-label="Quién paga la mesada">
                  {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            )}
            <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Al abrir la app cada día que toque, la mesada se suma sola a la alcancía{accountId ? ' y queda como gasto en esa cuenta (categoría «Mesada e hijos»)' : ''}.</p>
          </>
        )}
      </div>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</PrimaryButton>
    </Modal>
  );
}

function EntryModal({ kid, balance, actions, onClose, onSaved, currency }) {
  const [kind, setKind] = useState('regalo');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    const problem = validateLedgerEntry({ kind, amount, balance });
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try {
      await actions.addKidEntry({ kidId: kid.id, date, amount: LEDGER_KINDS[kind].sign * parseFloat(amount), kind, note });
      onSaved(); onClose();
    } catch (e) { setError(e.message || 'No se pudo guardar.'); } finally { setSaving(false); }
  }
  return (
    <Modal title={`Alcancía de ${kid.name}`} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Hoy hay {formatMoney(balance, currency)}. Esto solo cambia la alcancía; no mueve dinero de tus cuentas.</p>
      <Field label="Qué pasó">
        <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo de movimiento">
          <option value="regalo">Recibió dinero (regalo, abuelos…)</option>
          <option value="gasto">Gastó de su alcancía</option>
        </select>
      </Field>
      <Field label="Monto"><input style={inputStyle} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Monto" /></Field>
      <Field label="Fecha"><input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Detalle (opcional)"><input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Cumpleaños de la abuela" /></Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Guardar'}</PrimaryButton>
    </Modal>
  );
}

function KidDetail({ kid, store, data, actions, reload, onBack }) {
  const today = todayISO();
  const money = (n) => formatMoney(n, data.currency);
  const entries = store.ledger.filter((e) => e.kidId === kid.id);
  const summary = kidSummary(kid, entries, today);
  const tasks = store.tasks.filter((t) => t.kidId === kid.id);
  const goals = store.goals.filter((g) => g.kidId === kid.id);
  const celebrate = goalsToCelebrate(goals, summary.balance);
  const rows = ledgerWithBalance(entries);
  const [dialog, setDialog] = useState(null); // 'edit' | 'entry'
  const [taskTitle, setTaskTitle] = useState('');
  const [taskReward, setTaskReward] = useState('');
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); await reload(); } catch (e) { setError(e.message || 'No se pudo completar.'); } finally { setBusy(false); } };

  return (
    <div className="pb-4 pt-2">
      <button onClick={onBack} className="flex items-center gap-1 mb-3"><ChevronLeft size={16} color={T.inkSoft} /><span style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }}>Hijos y mesada</span></button>

      <Card style={{ marginBottom: 12, background: T.inverse, border: 'none' }}>
        <div className="flex items-center justify-between">
          <div>
            <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, color: T.onInverse }}>{kid.name}</p>
            <p style={{ fontSize: 12, color: T.onInverse, opacity: 0.8, fontFamily: FONT_BODY }}>{summary.age || 'Alcancía'}</p>
          </div>
          <button onClick={() => setDialog('edit')} aria-label="Editar perfil" className="p-2"><Pencil size={16} color={T.onInverse} /></button>
        </div>
        <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 28, color: T.onInverse }} className="mt-2">{money(summary.balance)}</p>
        <p style={{ fontSize: 11.5, color: T.onInverse, opacity: 0.8, fontFamily: FONT_BODY }}>Ha recibido {money(summary.inflow)} · ha gastado {money(summary.outflow)}</p>
        {summary.nextAllowance && (
          <p style={{ fontSize: 12, color: T.onInverse, fontFamily: FONT_BODY }} className="mt-2">
            Mesada de {money(summary.nextAllowance.amount)} {frequencyLabel(summary.nextAllowance.frequency)} · próxima {formatDate(summary.nextAllowance.date)}{summary.nextAllowance.overdue ? ' (se paga al abrir la app)' : ''}
          </p>
        )}
      </Card>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-2" role="alert">{error}</p>}

      <div className="flex gap-2 mb-3">
        <PrimaryButton onClick={() => setDialog('entry')} style={{ flex: 1 }}>Registrar dinero</PrimaryButton>
        {hasAllowance(kid) && <GhostButton disabled={busy} onClick={() => run(() => actions.payKidAllowanceNow(kid))} style={{ flex: 1 }}>Pagar mesada ahora</GhostButton>}
      </div>

      {celebrate.map((g) => (
        <Card key={g.id} style={{ marginBottom: 10, background: T.tealSoft, border: 'none' }}>
          <div className="flex items-center gap-2"><PartyPopper size={20} color={T.teal} />
            <div className="flex-1">
              <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>¡{kid.name} lo logró!</p>
              <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>Ya juntó para «{g.name}» ({money(g.targetAmount)}).</p>
            </div>
          </div>
          <GhostButton disabled={busy} onClick={() => run(() => actions.completeKidGoal(g))} style={{ marginTop: 8 }}>Ya lo compró</GhostButton>
        </Card>
      ))}

      <Card style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2 mb-2"><Target size={15} color={T.ink} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Metas de ahorro</p></div>
        {goals.length === 0 && <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Una meta le da sentido al ahorro: una bicicleta, un juguete, un viaje.</p>}
        {goals.map((g) => {
          const p = goalProgress(g, summary.balance);
          return (
            <div key={g.id} className="mb-3">
              <div className="flex justify-between gap-2">
                <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{g.name}{g.achievedAt ? ' · lograda' : ''}</span>
                <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_MONO }}>{money(g.targetAmount)}</span>
              </div>
              {!g.achievedAt && <ProgressBar value={p.pct} color={p.reached ? T.teal : T.gold} bg={T.track} />}
              <div className="flex justify-between">
                <span style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{g.achievedAt ? 'Ya la compró' : p.reached ? '¡Meta alcanzada!' : `${p.pct} % · faltan ${money(p.remaining)}`}</span>
                <button onClick={() => run(() => actions.removeKidGoal(g.id))} aria-label={`Quitar la meta ${g.name}`} className="p-1"><Trash2 size={13} color={T.inkSoft} /></button>
              </div>
            </div>
          );
        })}
        <div className="flex gap-2">
          <input style={{ ...inputStyle, flex: 2, fontSize: 13 }} value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder="Nueva meta" aria-label="Nombre de la meta" />
          <input style={{ ...inputStyle, flex: 1, fontSize: 13 }} inputMode="decimal" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="Valor" aria-label="Valor de la meta" />
          <GhostButton disabled={busy || !goalName.trim() || !(parseFloat(goalTarget) > 0)} onClick={() => run(async () => { await actions.addKidGoal(kid.id, { name: goalName, targetAmount: parseFloat(goalTarget) }); setGoalName(''); setGoalTarget(''); })} aria-label="Agregar meta"><Plus size={15} /></GhostButton>
        </div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2 mb-2"><ListChecks size={15} color={T.ink} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Tareas con recompensa</p></div>
        {tasks.length === 0 && <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Define tareas que se pagan cada vez que se cumplen (tender la cama, sacar la basura…).</p>}
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="flex-1 min-w-0"><p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{t.title}</p><p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_MONO }}>{money(t.reward)}</p></div>
            <button disabled={busy} onClick={() => run(() => actions.payKidReward(kid, t))} aria-label={`Marcar cumplida: ${t.title}`} className="rounded-full px-3 py-1 flex items-center gap-1" style={{ background: T.tealSoft }}>
              <Check size={13} color={T.teal} /><span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 600 }}>Cumplida</span>
            </button>
            <button onClick={() => run(() => actions.removeKidTask(t.id))} aria-label={`Quitar la tarea ${t.title}`} className="p-1"><Trash2 size={13} color={T.inkSoft} /></button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input style={{ ...inputStyle, flex: 2, fontSize: 13 }} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Nueva tarea" aria-label="Nombre de la tarea" />
          <input style={{ ...inputStyle, flex: 1, fontSize: 13 }} inputMode="decimal" value={taskReward} onChange={(e) => setTaskReward(e.target.value)} placeholder="Premio" aria-label="Premio de la tarea" />
          <GhostButton disabled={busy || !taskTitle.trim() || !(parseFloat(taskReward) > 0)} onClick={() => run(async () => { await actions.addKidTask(kid.id, { title: taskTitle, reward: parseFloat(taskReward) }); setTaskTitle(''); setTaskReward(''); })} aria-label="Agregar tarea"><Plus size={15} /></GhostButton>
        </div>
        {kid.allowanceAccountId && <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">Cada recompensa queda como gasto en la cuenta de la mesada.</p>}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2 mb-2"><Wallet size={15} color={T.ink} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Movimientos de la alcancía</p></div>
        {rows.length === 0 && <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>Aún no hay movimientos.</p>}
        {rows.map((e) => (
          <div key={e.id} className="flex items-start justify-between gap-2 py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="min-w-0">
              <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{LEDGER_KINDS[e.kind]?.label || e.kind}{e.note && e.note !== LEDGER_KINDS[e.kind]?.label ? ` · ${e.note}` : ''}</p>
              <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>{formatDate(e.date)} · saldo {money(e.balanceAfter)}</p>
            </div>
            <div className="flex items-center gap-1">
              <span style={{ fontSize: 13, fontFamily: FONT_MONO, fontWeight: 700, color: e.amount > 0 ? T.teal : T.coral }}>{e.amount > 0 ? '+' : '−'}{money(Math.abs(e.amount))}</span>
              {!e.transactionId && <button onClick={() => run(() => actions.deleteKidEntry(e.id))} aria-label="Quitar este movimiento" className="p-1"><Trash2 size={12} color={T.inkSoft} /></button>}
            </div>
          </div>
        ))}
      </Card>

      <div className="flex gap-2">
        <GhostButton onClick={() => run(() => actions.setKidArchived(kid.id, !kid.archived))} style={{ flex: 1, fontSize: 12.5 }}>{kid.archived ? 'Reactivar perfil' : 'Archivar perfil'}</GhostButton>
        <GhostButton onClick={() => { if (confirm(`¿Borrar el perfil de ${kid.name} y toda su alcancía? Los gastos ya registrados en tus cuentas se quedan.`)) run(async () => { await actions.deleteKid(kid.id); onBack(); }); }} style={{ flex: 1, fontSize: 12.5, color: T.danger }}>Borrar perfil</GhostButton>
      </div>

      {dialog === 'edit' && <KidModal data={data} actions={actions} kid={kid} onClose={() => setDialog(null)} onSaved={reload} />}
      {dialog === 'entry' && <EntryModal kid={kid} balance={summary.balance} actions={actions} currency={data.currency} onClose={() => setDialog(null)} onSaved={reload} />}
    </div>
  );
}

// Gestión → Hijos y mesada: alcancía, mesada programada, tareas con recompensa y metas de ahorro de cada niño.
export function Hijos({ data, actions }) {
  const [store, setStore] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const today = todayISO();
  const money = (n) => formatMoney(n, data.currency);

  const reload = useCallback(async () => {
    try { setStore(await actions.loadKids()); setError(''); } catch (e) { setError(e.message || 'No se pudo cargar.'); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  if (error) return <div className="pt-2"><p style={{ color: T.danger, fontSize: 13 }} role="alert">{error}</p></div>;
  if (!store) return null;

  const selected = store.kids.find((k) => k.id === selectedId);
  if (selected) return <KidDetail kid={selected} store={store} data={data} actions={actions} reload={reload} onBack={() => setSelectedId(null)} />;

  const active = store.kids.filter((k) => !k.archived);
  const archived = store.kids.filter((k) => k.archived);
  const card = (k) => {
    const s = kidSummary(k, store.ledger.filter((e) => e.kidId === k.id), today);
    const cheers = goalsToCelebrate(store.goals.filter((g) => g.kidId === k.id), s.balance).length;
    return (
      <button key={k.id} onClick={() => setSelectedId(k.id)} className="w-full text-left rounded-2xl p-4 mb-3 flex items-center gap-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 42, height: 42, borderRadius: 21, background: k.color }}><span style={{ color: '#fff', fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17 }}>{k.name.slice(0, 1).toUpperCase()}</span></div>
        <div className="flex-1 min-w-0">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, color: T.ink }}>{k.name}{s.age ? <span style={{ color: T.inkSoft, fontWeight: 400, fontSize: 12 }}> · {s.age}</span> : null}</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{s.nextAllowance ? `Mesada ${frequencyLabel(s.nextAllowance.frequency)} · próxima ${formatDate(s.nextAllowance.date)}` : 'Sin mesada'}</p>
          {cheers > 0 && <p style={{ fontSize: 11.5, color: T.teal, fontFamily: FONT_BODY, fontWeight: 600 }}>{cheers === 1 ? '¡Alcanzó una meta!' : `¡Alcanzó ${cheers} metas!`}</p>}
        </div>
        <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 14, color: T.ink }}>{money(s.balance)}</span>
      </button>
    );
  };

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center gap-2 mb-1"><Baby size={18} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Hijos y mesada</p></div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Una alcancía por cada niño, con mesada automática, tareas con recompensa y metas de ahorro. Los administran los adultos del hogar.</p>
      <PrimaryButton full onClick={() => setAdding(true)} style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={16} /> Agregar hijo o hija</PrimaryButton>
      {active.length === 0 && <EmptyState icon={<Baby size={32} color={T.inkSoft} />} title="Aún no hay perfiles" subtitle="Crea el de tu hijo o hija para llevar su alcancía y su mesada." />}
      {active.map(card)}
      {archived.length > 0 && (
        <>
          <button onClick={() => setShowArchived(!showArchived)} className="mb-2"><span style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{showArchived ? 'Ocultar' : 'Ver'} archivados ({archived.length})</span></button>
          {showArchived && archived.map(card)}
        </>
      )}
      {adding && <KidModal data={data} actions={actions} onClose={() => setAdding(false)} onSaved={reload} />}
    </div>
  );
}
