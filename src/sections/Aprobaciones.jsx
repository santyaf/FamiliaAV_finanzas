import React, { useState } from 'react';
import { BadgeCheck, Plus, Check, X, Clock, Send } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, Modal, PrimaryButton, GhostButton, Field, EmptyState } from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { groupRequests, requestProgress, STATUS_LABELS } from '../lib/spendRequests';

const STATUS_TONE = { pending: T.gold, approved: T.teal, rejected: T.danger, cancelled: T.inkSoft, done: T.teal };

function RequestCard({ r, data, actions, setModal, mode }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const money = (n) => formatMoney(n, data.currency);
  const byId = Object.fromEntries(data.members.map((m) => [m.id, m]));
  const category = data.categories.find((c) => c.id === r.categoryId);
  const account = data.accounts.find((a) => a.id === r.accountId);
  const progress = requestProgress(r, data.spendVotes, data.members);
  const myVote = progress.votes.find((v) => v.memberId === actions.userId)?.vote || null;
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const vote = (v) => run(() => actions.voteSpendRequest(r.id, v, comment));
  const register = () => setModal({ type: 'transaction', payload: { source: 'request', requestId: r.id, type: 'expense', description: r.title, amount: r.amount, categoryId: r.categoryId || undefined, accountId: r.accountId || undefined, memberId: actions.userId } });

  return (
    <Card style={{ marginBottom: 10 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>{r.title}</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>
            {byId[r.requestedBy]?.name || 'Integrante'} · {formatDate(String(r.createdAt).slice(0, 10))}{category ? ` · ${category.name}` : ''}{account ? ` · ${account.name}` : ''}
          </p>
        </div>
        <span style={{ fontFamily: FONT_MONO, fontSize: 14, fontWeight: 700, color: T.ink }}>{money(r.amount)}</span>
      </div>
      {r.note && <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }} className="mt-1.5">{r.note}</p>}

      <div className="flex items-center gap-1.5 mt-2">
        <Clock size={12} color={STATUS_TONE[r.status]} />
        <span style={{ fontSize: 12, color: STATUS_TONE[r.status], fontFamily: FONT_BODY, fontWeight: 600 }}>{STATUS_LABELS[r.status]}</span>
        {r.status === 'pending' && (
          <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>
            · {progress.approvals} de {progress.needed} aprobaciones{progress.waitingOn.length ? ` · falta ${progress.waitingOn.map((m) => m.name).join(', ')}` : ''}
          </span>
        )}
      </div>
      {progress.votes.some((v) => v.comment) && (
        <div className="mt-1.5">
          {progress.votes.filter((v) => v.comment).map((v) => (
            <p key={v.memberId} style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>
              <b style={{ color: T.ink }}>{byId[v.memberId]?.name || 'Integrante'}</b> ({v.vote === 'approve' ? 'aprobó' : 'rechazó'}): {v.comment}
            </p>
          ))}
        </div>
      )}

      {mode === 'answer' && (
        <div className="mt-3">
          <input style={{ ...inputStyle, fontSize: 13, marginBottom: 8 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comentario (opcional)" aria-label={`Comentario sobre ${r.title}`} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => vote('approve')} aria-pressed={myVote === 'approve'} className="flex-1 rounded-xl py-2 flex items-center justify-center gap-1.5"
              style={{ background: myVote === 'approve' ? T.teal : T.tealSoft }}>
              <Check size={15} color={myVote === 'approve' ? '#fff' : T.teal} /><span style={{ fontSize: 13, fontFamily: FONT_BODY, fontWeight: 600, color: myVote === 'approve' ? '#fff' : T.teal }}>Aprobar</span>
            </button>
            <button disabled={busy} onClick={() => vote('reject')} aria-pressed={myVote === 'reject'} className="flex-1 rounded-xl py-2 flex items-center justify-center gap-1.5"
              style={{ background: myVote === 'reject' ? T.danger : T.dangerSoft }}>
              <X size={15} color={myVote === 'reject' ? '#fff' : T.danger} /><span style={{ fontSize: 13, fontFamily: FONT_BODY, fontWeight: 600, color: myVote === 'reject' ? '#fff' : T.danger }}>Rechazar</span>
            </button>
          </div>
        </div>
      )}
      {mode === 'register' && (
        <div className="flex gap-2 mt-3">
          <PrimaryButton onClick={register} style={{ flex: 1 }}>Registrar el gasto</PrimaryButton>
          <GhostButton disabled={busy} onClick={() => run(() => actions.cancelSpendRequest(r.id))}>Ya no</GhostButton>
        </div>
      )}
      {mode === 'mine' && (
        <div className="mt-3">
          <GhostButton disabled={busy} onClick={() => run(() => actions.cancelSpendRequest(r.id))} style={{ fontSize: 12.5 }}>Cancelar solicitud</GhostButton>
        </div>
      )}
    </Card>
  );
}

export function SpendRequestModal({ data, actions, onClose }) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const amt = parseFloat(amount);
  async function save() {
    if (!title.trim() || !(amt > 0)) { setError('Escribe qué quieres comprar y cuánto cuesta.'); return; }
    setSaving(true); setError('');
    try { await actions.createSpendRequest({ title, amount: amt, categoryId, accountId, note }); onClose(); } catch (e) { setError(e.message || 'No se pudo enviar la solicitud.'); } finally { setSaving(false); }
  }
  return (
    <Modal title="Pedir visto bueno" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Los demás integrantes reciben un aviso y responden. Cuando la mayoría aprueba, puedes registrar el gasto.</p>
      <Field label="¿Qué quieres comprar o pagar?"><input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Nevera nueva" /></Field>
      <Field label="Monto"><input style={inputStyle} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></Field>
      <Field label="Categoría (opcional)">
        <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">Sin elegir</option>
          {data.categories.filter((c) => c.type === 'expense').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Cuenta con la que pagarías (opcional)">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Sin elegir</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Detalle (opcional)"><input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por qué, dónde, cuándo…" /></Field>
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Enviando…' : 'Enviar solicitud'}</PrimaryButton>
    </Modal>
  );
}

function ThresholdCard({ data, actions }) {
  const isAdmin = actions.myRole === 'admin';
  const [text, setText] = useState(data.approvalThreshold ? String(data.approvalThreshold) : '');
  const [saving, setSaving] = useState(false);
  const money = (n) => formatMoney(n, data.currency);
  async function save(value) { setSaving(true); try { await actions.setApprovalThreshold(value); } finally { setSaving(false); } }
  return (
    <Card style={{ marginBottom: 14 }}>
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-1">Gasto grande</p>
      <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">
        {data.approvalThreshold
          ? `Desde ${money(data.approvalThreshold)} el hogar acordó consultar antes de gastar. Al registrar un gasto así la app te lo recuerda; no lo bloquea.`
          : 'Sin umbral: nadie recibe recordatorios al registrar un gasto grande. Igual se puede pedir visto bueno cuando quieran.'}
      </p>
      {isAdmin ? (
        <div className="flex gap-2 items-center">
          <input style={{ ...inputStyle, flex: 1 }} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej. 500000 (vacío = sin umbral)" aria-label="Umbral de gasto grande" />
          <GhostButton disabled={saving} onClick={() => save(parseFloat(text) > 0 ? parseFloat(text) : null)}>Guardar</GhostButton>
        </div>
      ) : <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Lo cambia un administrador del hogar.</p>}
    </Card>
  );
}

// Gestión → Aprobaciones: pedir el visto bueno de los demás antes de un gasto grande.
export function Aprobaciones({ data, actions, setModal }) {
  const groups = groupRequests(data.spendRequests, data.spendVotes, data.members, actions.userId);
  const Section = ({ title, list, mode }) => (list.length ? (
    <div className="mb-3">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13, color: T.ink }} className="mb-2">{title}</p>
      {list.map((r) => <RequestCard key={r.id} r={r} data={data} actions={actions} setModal={setModal} mode={mode} />)}
    </div>
  ) : null);
  const nothing = !data.spendRequests.length;

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center gap-2 mb-1"><BadgeCheck size={18} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Aprobaciones</p></div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Antes de un gasto grande, pidan el visto bueno del hogar. Aprueba la mayoría de los demás integrantes.</p>

      {data.members.length < 2 ? (
        <EmptyState icon={<Send size={32} color={T.inkSoft} />} title="Necesitas a alguien más" subtitle="Las aprobaciones son entre integrantes del hogar. Invita a alguien desde Ajustes → Invitar." />
      ) : (
        <>
          <ThresholdCard data={data} actions={actions} />
          <PrimaryButton full onClick={() => setModal({ type: 'spendRequest' })} style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={16} /> Pedir visto bueno</PrimaryButton>
          {nothing && <EmptyState icon={<BadgeCheck size={32} color={T.inkSoft} />} title="Aún no hay solicitudes" subtitle="Cuando alguien pida el visto bueno para un gasto, aparecerá aquí." />}
          <Section title="Esperan tu respuesta" list={groups.toAnswer} mode="answer" />
          <Section title="Aprobadas: falta registrar el gasto" list={groups.toRegister} mode="register" />
          <Section title="Tus solicitudes abiertas" list={groups.mine} mode="mine" />
          <Section title="Ya respondiste" list={groups.answered} mode="answer" />
          <Section title="Historial" list={groups.history} mode="none" />
        </>
      )}
    </div>
  );
}
