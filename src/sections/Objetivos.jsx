import React, { useState, useEffect } from 'react';
import { ThumbsDown, ThumbsUp, Target, Star, Users2, Trash2, Info } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle, PRIORITY_LABEL } from '../ui/theme';
import {
  Card, PrimaryButton, GhostButton, IconButton, ProgressBar, Modal, Field, MemberChip, EmptyState,
} from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { goalPriorityScore } from '../lib/finance';

export function Objetivos({ data, actions, setModal }) {
  const currency = data.currency;
  const myId = actions.userId;
  const sorted = [...data.goals].sort((a, b) => goalPriorityScore(b) - goalPriorityScore(a));
  const [requests, setRequests] = useState(null);

  async function refreshRequests() {
    setRequests(await actions.loadPendingGoalRequests());
  }
  useEffect(() => { refreshRequests(); }, []);

  function removeGoal(id) { actions.removeGoal(id); }

  async function vote(request, approve) {
    await actions.voteOnGoalRequest(request, approve);
    await refreshRequests();
  }

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Objetivos de compra</p>
        <PrimaryButton onClick={() => setModal({ type: 'goal' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nuevo</PrimaryButton>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Cada objetivo es un "bolsillo": lo que aportas se aparta de tu saldo disponible, pero no cuenta como gasto. Los familiares se votan entre todos; para editarlos o retirar dinero se necesita que todos aprueben.
      </p>

      {requests?.length > 0 && (
        <Card style={{ marginBottom: 16, background: T.amberSoft, border: 'none' }}>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Solicitudes pendientes de aprobación</p>
          {requests.map((r) => {
            const already = r.votes.find((v) => v.member_id === myId);
            return (
              <div key={r.id} className="rounded-xl p-3 mb-2" style={{ background: T.surface }}>
                <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>
                  <b>{r.requestedByName}</b> pidió {r.changeType === 'withdraw' ? `retirar ${formatMoney(r.withdrawAmount, currency)} de` : 'editar la meta de'} "{r.goalName}"
                  {r.changeType === 'edit_target' && ` a ${formatMoney(r.newTargetAmount, currency)}${r.newTargetDate ? ` (${formatDate(r.newTargetDate)})` : ''}`}
                </p>
                <p style={{ fontSize: 11, color: T.inkSoft }} className="mb-2">{r.votes.filter((v) => v.approve).length}/{data.members.length} aprobaciones — se necesita unanimidad</p>
                {already ? (
                  <p style={{ fontSize: 11.5, color: T.teal }}>Ya {already.approve ? 'aprobaste' : 'rechazaste'} esta solicitud</p>
                ) : (
                  <div className="flex gap-2">
                    <GhostButton onClick={() => vote(r, false)} style={{ flex: 1, fontSize: 12, padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><ThumbsDown size={13} /> Rechazar</GhostButton>
                    <PrimaryButton onClick={() => vote(r, true)} style={{ flex: 1, fontSize: 12, padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><ThumbsUp size={13} /> Aprobar</PrimaryButton>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {sorted.length === 0 && <EmptyState icon={<Target size={36} color={T.teal} />} title="Sin objetivos aún" subtitle="Crea una meta de compra, como 'Vacaciones' o 'Nuevo refrigerador'." />}

      <div className="flex flex-col gap-3">
        {sorted.map((g) => {
          const score = goalPriorityScore(g);
          const pct = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
          const votesCount = Object.keys(g.votes || {}).length;
          const owner = g.ownerMemberId ? data.members.find((m) => m.id === g.ownerMemberId) : null;
          return (
            <Card key={g.id}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: T.ink }}>{g.name}</p>
                    {owner ? (
                      <span className="rounded-full px-2 py-0.5" style={{ background: T.bg }}><span style={{ fontSize: 9.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{owner.name}</span></span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: T.tealSoft }}><Users2 size={9} color={T.teal} /><span style={{ fontSize: 9.5, color: T.teal, fontFamily: FONT_BODY }}>Familiar</span></span>
                    )}
                  </div>
                  {g.targetDate && <p style={{ fontSize: 11.5, color: T.inkSoft }}>Meta para {formatDate(g.targetDate)}</p>}
                </div>
                <div className="flex items-center gap-1 rounded-full px-2 py-1" style={{ background: score >= 2.5 ? T.coralSoft : score >= 1.5 ? T.goldSoft : T.tealSoft }}>
                  <Star size={12} color={score >= 2.5 ? T.coral : score >= 1.5 ? T.gold : T.teal} />
                  <span style={{ fontSize: 11, fontFamily: FONT_BODY, color: T.ink }}>{score >= 2.5 ? 'Alta' : score >= 1.5 ? 'Media' : 'Baja'} · {votesCount}/{data.members.length} votos</span>
                </div>
              </div>
              <ProgressBar value={pct} color={T.gold} />
              <div className="flex items-center justify-between mt-1.5">
                <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.inkSoft }}>{formatMoney(g.currentAmount, currency)} de {formatMoney(g.targetAmount, currency)}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink }}>{Math.round(pct)}%</span>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <GhostButton onClick={() => setModal({ type: 'vote', payload: g })} style={{ flex: 1, fontSize: 12, padding: '8px' }}>Votar</GhostButton>
                <GhostButton onClick={() => setModal({ type: 'editGoal', payload: g })} style={{ flex: 1, fontSize: 12, padding: '8px' }}>Editar</GhostButton>
                <PrimaryButton onClick={() => setModal({ type: 'contribute', payload: g })} style={{ flex: 1, fontSize: 12, padding: '8px' }}>Aportar</PrimaryButton>
                {g.currentAmount > 0 && <GhostButton onClick={() => setModal({ type: 'withdrawGoal', payload: g })} style={{ flex: 1, fontSize: 12, padding: '8px' }}>Retirar</GhostButton>}
                <IconButton icon={Trash2} variant="danger" onClick={() => removeGoal(g.id)} confirmMessage={`¿Eliminar el objetivo "${g.name}"? Se perderá todo el progreso registrado.`} label="Eliminar objetivo" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function GoalModal({ data, actions, onClose }) {
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [ownerMemberId, setOwnerMemberId] = useState('');
  async function save() {
    if (!name.trim() || !parseFloat(targetAmount)) return;
    await actions.addGoal({ name: name.trim(), targetAmount: parseFloat(targetAmount), targetDate: targetDate || null, ownerMemberId: ownerMemberId || null });
    onClose();
  }
  return (
    <Modal title="Nuevo objetivo de compra" onClose={onClose}>
      <Field label="Nombre del objetivo">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Vacaciones en familia" />
      </Field>
      <Field label="Monto meta">
        <input style={inputStyle} type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Fecha meta (opcional)">
        <input style={inputStyle} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Field label="Alcance">
        <select style={inputStyle} value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
          <option value="">Familiar (todo el hogar vota y aprueba cambios)</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>Individual — solo {m.name}</option>)}
        </select>
      </Field>
      <PrimaryButton full onClick={save}>Crear objetivo</PrimaryButton>
    </Modal>
  );
}

export function VoteModal({ data, actions, payload, onClose }) {
  const goal = payload;
  const [votes, setVotes] = useState(goal.votes || {});
  async function save() {
    await actions.voteGoal(goal.id, votes);
    onClose();
  }
  return (
    <Modal title={`Votar prioridad: ${goal.name}`} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Cada integrante elige qué tan prioritario es este objetivo para el hogar.</p>
      {data.members.map((m) => (
        <div key={m.id} className="flex items-center justify-between mb-3">
          <MemberChip member={m} />
          <div className="flex gap-1.5">
            {[1, 2, 3].map((v) => (
              <button key={v} onClick={() => setVotes({ ...votes, [m.id]: v })}
                className="rounded-lg px-2.5 py-1.5"
                style={{ background: votes[m.id] === v ? T.gold : T.bg, border: `1px solid ${votes[m.id] === v ? T.gold : T.border}` }}>
                <span style={{ fontSize: 11.5, color: votes[m.id] === v ? '#fff' : T.inkSoft }}>{PRIORITY_LABEL[v]}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <PrimaryButton full onClick={save}>Guardar votos</PrimaryButton>
    </Modal>
  );
}

export function ContributeModal({ data, actions, payload, onClose }) {
  const goal = payload;
  const [amount, setAmount] = useState('');
  const [memberId, setMemberId] = useState(data.members[0]?.id || '');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [saving, setSaving] = useState(false);
  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await actions.contributeGoal(goal, amt, memberId, accountId);
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={`Aportar a: ${goal.name}`} onClose={onClose}>
      <Field label="Monto a aportar">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Integrante que aporta">
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Desde la cuenta">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-4">Este dinero se aparta como una transferencia — no cuenta como gasto, pero sí reduce el saldo disponible de la cuenta.</p>
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Confirmar aporte'}</PrimaryButton>
    </Modal>
  );
}

export function WithdrawGoalModal({ data, actions, payload, onClose }) {
  const goal = payload;
  const isFamiliar = !goal.ownerMemberId;
  const [amount, setAmount] = useState('');
  const [memberId, setMemberId] = useState(goal.ownerMemberId || data.members[0]?.id || '');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || amt > goal.currentAmount) { setError('Ingresa un monto válido (no puede superar lo acumulado).'); return; }
    if (!isFamiliar && !confirm(`¿Retirar ${formatMoney(amt, data.currency)} de "${goal.name}"?`)) return;
    setSaving(true); setError('');
    try {
      const result = await actions.editOrWithdrawGoal(goal, {
        type: 'withdraw', withdrawAmount: amt, withdrawMemberId: memberId, withdrawAccountId: accountId,
      });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo procesar el retiro.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Retirar de: ${goal.name}`} onClose={onClose}>
      {isFamiliar && (
        <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.amberSoft }}>
          <Info size={14} color={T.amber} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 11.5, color: T.ink, fontFamily: FONT_BODY }}>Como es un objetivo familiar, este retiro necesita que todos los integrantes lo aprueben antes de aplicarse.</p>
        </div>
      )}
      <Field label={`Monto a retirar (disponible: ${formatMoney(goal.currentAmount, data.currency)})`}>
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Integrante">
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Hacia la cuenta">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Procesando…' : isFamiliar ? 'Enviar para aprobación' : 'Confirmar retiro'}</PrimaryButton>
    </Modal>
  );
}

export function EditGoalModal({ data, actions, payload, onClose }) {
  const goal = payload;
  const isFamiliar = !goal.ownerMemberId;
  const [targetAmount, setTargetAmount] = useState(String(goal.targetAmount));
  const [targetDate, setTargetDate] = useState(goal.targetDate || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const amt = parseFloat(targetAmount);
    if (!amt) { setError('Ingresa un monto meta válido.'); return; }
    if (!isFamiliar && !confirm(`¿Confirmar el nuevo monto meta de "${goal.name}"?`)) return;
    setSaving(true); setError('');
    try {
      await actions.editOrWithdrawGoal(goal, { type: 'edit_target', newTargetAmount: amt, newTargetDate: targetDate || null });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo guardar el cambio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Editar: ${goal.name}`} onClose={onClose}>
      {isFamiliar && (
        <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.amberSoft }}>
          <Info size={14} color={T.amber} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 11.5, color: T.ink, fontFamily: FONT_BODY }}>Como es un objetivo familiar, este cambio necesita que todos los integrantes lo aprueben antes de aplicarse.</p>
        </div>
      )}
      <Field label="Nuevo monto meta">
        <input style={inputStyle} type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
      </Field>
      <Field label="Nueva fecha meta (opcional)">
        <input style={inputStyle} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : isFamiliar ? 'Enviar para aprobación' : 'Guardar cambio'}</PrimaryButton>
    </Modal>
  );
}
