import React, { useState } from 'react';
import { History, Trash2, Info } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, GhostButton, ProgressBar, Modal, Field } from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { todayISO, accountBalance } from '../lib/finance';
import { toEffectiveAnnual, fromEffectiveAnnual } from '../lib/amortization';
import {
  cardUsage, cardCycle, planOverview, planSchedule, buildRedefer, payToAvoidInterest, firstBillDate, CARD_EVENT_LABELS,
} from '../lib/creditCards';
import { RateField, fmtPct } from './Creditos';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const isCard = (account) => account?.paymentKind === 'tarjeta_credito';

// Resumen de la tarjeta dentro de su cuenta: cupo, corte, pago y compras diferidas.
export function CardSummary({ account, balance, data, setModal }) {
  const currency = data.currency;
  const usage = cardUsage(account, balance);
  const cycle = cardCycle(account, todayISO());
  const plans = (data.cardPlans || []).filter((p) => p.accountId === account.id);
  const active = plans.filter((p) => p.status === 'activo');
  const pay = payToAvoidInterest(usage.used, plans);
  const over = usage.available !== null && usage.available < 0;

  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
      {usage.limit > 0 ? (
        <>
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>Cupo usado {Math.round(usage.utilization * 100)}%</span>
            <span style={{ fontSize: 12, color: over ? T.danger : T.teal, fontFamily: FONT_MONO, fontWeight: 600 }}>
              {over ? 'Excedido en ' : 'Disponible '}{formatMoney(Math.abs(usage.available), currency)}
            </span>
          </div>
          <ProgressBar value={usage.utilization * 100} color={usage.utilization > 0.9 ? T.danger : usage.utilization > 0.7 ? T.gold : T.teal} />
          <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Debes {formatMoney(usage.used, currency)} de un cupo de {formatMoney(usage.limit, currency)}</p>
        </>
      ) : (
        <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>Debes {formatMoney(usage.used, currency)}. Edita la cuenta y agrega el cupo para ver cuánto te queda disponible.</p>
      )}
      {usage.credit > 0 && <p style={{ fontSize: 11.5, color: T.teal, fontFamily: FONT_BODY }} className="mt-1">Tienes {formatMoney(usage.credit, currency)} a favor en la tarjeta.</p>}

      {cycle.nextStatement && (
        <p style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }} className="mt-2">
          Próximo corte: <strong>{formatDate(cycle.nextStatement)}</strong>
          {cycle.paymentDue && <> · Pagar antes del <strong>{formatDate(cycle.paymentDue)}</strong></>}
        </p>
      )}
      {usage.used > 0 && (
        <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">
          {pay.deferred > 0
            ? `Para no pagar intereses: ≈ ${formatMoney(pay.payNow, currency)} (${formatMoney(pay.deferred, currency)} siguen diferidos en cuotas).`
            : 'Para no pagar intereses: paga la deuda completa.'}
        </p>
      )}

      <div className="flex gap-2 mt-3">
        <PrimaryButton onClick={() => setModal({ type: 'cardPay', payload: { account } })} style={{ padding: '8px 14px', fontSize: 13, flex: 1 }}>Pagar tarjeta</PrimaryButton>
        <GhostButton onClick={() => setModal({ type: 'cardPlans', payload: { account } })} style={{ padding: '8px 14px', fontSize: 13, flex: 1 }}>
          Compras diferidas{active.length ? ` (${active.length})` : ''}
        </GhostButton>
      </div>
    </div>
  );
}

// Campos para diferir una compra con tarjeta (dentro del formulario de un gasto).
export function DeferralFields({ account, amount, date, value, onChange, currency }) {
  const { enabled, installments, rateValue, rateType } = value;
  const set = (patch) => onChange({ ...value, ...patch });
  const amt = num(amount);
  const n = parseInt(installments, 10) || 0;
  const rate = toEffectiveAnnual(num(rateValue), rateType);
  const bill = firstBillDate(date, account.statementDay);
  const rows = enabled && amt > 0 && n >= 2 ? planSchedule({ principal: amt, annualRate: rate, installments: n, firstBillDate: bill }) : [];
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  return (
    <div className="rounded-xl p-3 mb-4" style={{ background: enabled ? T.tealSoft : T.bg }}>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        <span style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Diferir esta compra a cuotas</span>
      </label>
      {enabled && (
        <div className="mt-3">
          <Field label="Número de cuotas">
            <input style={inputStyle} type="number" min="2" max="120" value={installments} onChange={(e) => set({ installments: e.target.value })} />
          </Field>
          <RateField label="Tasa de interés de la compra (0 si es sin interés)" value={rateValue} type={rateType} onChange={(v, t) => set({ rateValue: v, rateType: t })} />
          {rows.length > 0 && (
            <div style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>
              <p>Primera cuota en el corte del <strong>{formatDate(bill)}</strong>: <strong style={{ fontFamily: FONT_MONO }}>{formatMoney(rows[0].capital + rows[0].interest, currency)}</strong>
                {' '}({formatMoney(rows[0].capital, currency)} capital + {formatMoney(rows[0].interest, currency)} interés)</p>
              <p style={{ color: T.inkSoft }} className="mt-0.5">Intereses totales ≈ {formatMoney(totalInterest, currency)}. La compra se registra completa hoy y usa todo el cupo; el interés se registra como gasto en cada corte.</p>
            </div>
          )}
          {!account.statementDay && (
            <p className="flex items-start gap-1 mt-2" style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}><Info size={12} style={{ marginTop: 1, flexShrink: 0 }} /> Sin día de corte configurado, las cuotas se facturan el mismo día del mes de la compra. Edita la cuenta para poner el corte real.</p>
          )}
        </div>
      )}
    </div>
  );
}

export const emptyDeferral = (account) => ({
  enabled: false, installments: '12',
  rateValue: account?.cardRate ? String(Math.round(account.cardRate * 100) / 100) : '0', rateType: 'EA',
});

// Convierte el estado del formulario en lo que necesita addTransaction (o null si no difiere).
export function deferralToPlan(value, date, account) {
  if (!value.enabled) return { plan: null };
  const n = parseInt(value.installments, 10);
  if (!(n >= 2 && n <= 120)) return { error: 'Indica un número de cuotas entre 2 y 120.' };
  const annualRate = toEffectiveAnnual(num(value.rateValue), value.rateType);
  if (!(annualRate >= 0)) return { error: 'La tasa no puede ser negativa.' };
  return { plan: { installments: n, annualRate, firstBillDate: firstBillDate(date, account.statementDay) } };
}

export function CardPayModal({ data, actions, payload, onClose }) {
  const { account } = payload;
  const currency = data.currency;
  const usage = cardUsage(account, accountBalance(data.transactions, account.id));
  const plans = (data.cardPlans || []).filter((p) => p.accountId === account.id);
  const pay = payToAvoidInterest(usage.used, plans);
  const sources = data.accounts.filter((a) => a.id !== account.id && !isCard(a));
  const [fromAccountId, setFromAccountId] = useState(sources[0]?.id || '');
  const [amount, setAmount] = useState(pay.payNow > 0 ? String(Math.round(pay.payNow)) : usage.used > 0 ? String(Math.round(usage.used)) : '');
  const [date, setDate] = useState(todayISO());
  const [memberId, setMemberId] = useState(account.ownerIds?.[0] || data.members[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const amt = num(amount);
    if (!(amt > 0)) { setError('Ingresa un monto válido.'); return; }
    if (!fromAccountId) { setError('Elige la cuenta desde la que pagas.'); return; }
    setSaving(true); setError('');
    try {
      await actions.payCreditCard({ cardAccountId: account.id, cardName: account.name, fromAccountId, amount: amt, date, memberId });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Pagar ${account.name}`} onClose={onClose}>
      <div className="rounded-xl p-3 mb-4" style={{ background: T.bg }}>
        <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>Deuda actual de la tarjeta</p>
        <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 20, color: T.ink }}>{formatMoney(usage.used, currency)}</p>
      </div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {pay.payNow > 0 && pay.deferred > 0 && (
          <button type="button" className="rounded-lg px-3 py-1.5" style={{ background: T.tealSoft }} onClick={() => setAmount(String(Math.round(pay.payNow)))}>
            <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 600 }}>Sin intereses ≈ {formatMoney(pay.payNow, currency)}</span>
          </button>
        )}
        {usage.used > 0 && (
          <button type="button" className="rounded-lg px-3 py-1.5" style={{ background: T.bg }} onClick={() => setAmount(String(Math.round(usage.used)))}>
            <span style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>Total {formatMoney(usage.used, currency)}</span>
          </button>
        )}
      </div>
      <Field label="Monto a pagar">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Pagar desde la cuenta">
        <select style={inputStyle} value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
          {sources.length === 0 && <option value="">No tienes otra cuenta</option>}
          {sources.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha">
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Se registra como una transferencia hacia la tarjeta: baja tu deuda y libera cupo, pero no es un gasto (el gasto ya quedó registrado cuando compraste).
      </p>
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Registrar pago'}</PrimaryButton>
    </Modal>
  );
}

export function CardPlansModal({ data, actions, payload, onClose, setModal }) {
  const { account } = payload;
  const currency = data.currency;
  const plans = (data.cardPlans || []).filter((p) => p.accountId === account.id);
  const [events, setEvents] = useState({}); // planId -> eventos
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  async function toggleHistory(plan) {
    if (openId === plan.id) { setOpenId(null); return; }
    setOpenId(plan.id);
    if (!events[plan.id]) {
      try { setEvents((e) => ({ ...e, [plan.id]: [] })); const list = await actions.loadCardPlanEvents(plan.id); setEvents((e) => ({ ...e, [plan.id]: list })); }
      catch (e) { setError(e.message || 'No se pudo cargar el historial.'); }
    }
  }
  async function removePlan(plan) {
    if (!confirm(`¿Eliminar el plan de cuotas de "${plan.description}"? La compra y los intereses ya registrados no se borran; solo dejan de facturarse cuotas nuevas.`)) return;
    try { await actions.deleteCardPlan(plan.id); } catch (e) { setError(e.message || 'No se pudo eliminar el plan.'); }
  }

  const active = plans.filter((p) => p.status === 'activo');
  const done = plans.filter((p) => p.status !== 'activo');
  const renderPlan = (plan) => {
    const o = planOverview(plan);
    const list = events[plan.id];
    return (
      <Card key={plan.id} style={{ marginBottom: 10 }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{plan.description}</p>
            <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>
              {plan.status === 'activo' ? `Cuota ${Math.min(o.billed + 1, o.total)} de ${o.total}` : 'Totalmente facturada'} · {fmtPct(plan.annualRate)} E.A.
            </p>
          </div>
          {plan.status === 'activo' && o.next && (
            <div className="text-right">
              <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 14, color: T.ink }}>{formatMoney(o.next.capital + o.next.interest, currency)}</p>
              <p style={{ fontSize: 10.5, color: T.inkSoft }}>corte {formatDate(o.next.dueDate)}</p>
            </div>
          )}
        </div>
        {plan.status === 'activo' && (
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">
            Capital diferido: {formatMoney(o.outstanding, currency)} · Intereses que faltan: {formatMoney(o.remainingInterest, currency)}
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          {plan.status === 'activo' && (
            <GhostButton onClick={() => setModal({ type: 'redeferPlan', payload: { plan, account } })} style={{ padding: '6px 12px', fontSize: 12.5 }}>Rediferir / abonar</GhostButton>
          )}
          <button onClick={() => toggleHistory(plan)} className="flex items-center gap-1 px-2 py-1"><History size={13} color={T.inkSoft} /><span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>Historial</span></button>
          <button onClick={() => removePlan(plan)} className="flex items-center gap-1 px-2 py-1 ml-auto"><Trash2 size={13} color={T.danger} /></button>
        </div>
        {openId === plan.id && (
          <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${T.border}` }}>
            {!list && <p style={{ fontSize: 12, color: T.inkSoft }}>Cargando…</p>}
            {list?.length === 0 && <p style={{ fontSize: 12, color: T.inkSoft }}>Sin movimientos todavía.</p>}
            {list?.map((e) => (
              <div key={e.id} className="mb-2">
                <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{CARD_EVENT_LABELS[e.kind] || e.kind} · {formatDate(e.date)}{e.amount ? ` · ${formatMoney(e.amount, currency)}` : ''}</p>
                {e.note && <p style={{ fontSize: 11, color: T.inkSoft }}>{e.note}</p>}
                {e.kind === 'rediferido' || e.kind === 'abono' ? (
                  <>
                    {e.rateBefore !== null && e.rateAfter !== null && e.rateBefore !== e.rateAfter && <p style={{ fontSize: 11, color: T.inkSoft }}>Tasa: {fmtPct(e.rateBefore)} → {fmtPct(e.rateAfter)} E.A.</p>}
                    {e.installmentBefore !== null && e.installmentAfter !== null && <p style={{ fontSize: 11, color: T.inkSoft }}>Cuota: {formatMoney(e.installmentBefore, currency)} → {formatMoney(e.installmentAfter, currency)} · cuotas que faltan {e.termBefore} → {e.termAfter}</p>}
                    {e.balanceBefore !== null && e.balanceAfter !== null && <p style={{ fontSize: 11, color: T.inkSoft }}>Capital diferido: {formatMoney(e.balanceBefore, currency)} → {formatMoney(e.balanceAfter, currency)}</p>}
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  };

  return (
    <Modal title={`Compras diferidas — ${account.name}`} wide onClose={onClose}>
      {plans.length === 0 && (
        <p style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">
          No tienes compras diferidas en esta tarjeta. Al registrar un gasto en ella puedes marcar "Diferir esta compra a cuotas".
        </p>
      )}
      {active.map(renderPlan)}
      {done.length > 0 && <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2 mt-3">Ya facturadas</p>}
      {done.map(renderPlan)}
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mt-2">{error}</p>}
    </Modal>
  );
}

export function RedeferModal({ data, actions, payload, onClose }) {
  const { plan } = payload;
  const currency = data.currency;
  const before = planOverview(plan);
  const remaining = before.total - before.billed;
  const [rateValue, setRateValue] = useState(String(Math.round(plan.annualRate * 10000) / 10000));
  const [rateType, setRateType] = useState('EA');
  const [installments, setInstallments] = useState(String(remaining));
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const newRate = toEffectiveAnnual(num(rateValue), rateType);
  const n = parseInt(installments, 10) || 0;
  const extraPayment = Math.max(0, num(extra));
  const r = n > 0 && newRate >= 0 ? buildRedefer(plan, { annualRate: newRate, installments: n, extraPayment }) : null;
  const inst = (o) => (o?.next ? o.next.capital + o.next.interest : null);

  async function save() {
    if (!(n > 0) || !(newRate >= 0)) { setError('Indica la tasa y cuántas cuotas faltarán.'); return; }
    if (extraPayment > before.outstanding + 0.005) { setError('El abono no puede ser mayor al capital diferido.'); return; }
    setSaving(true); setError('');
    try {
      await actions.redeferCardPlan(plan, { annualRate: newRate, installments: n, extraPayment, note: note.trim(), date: todayISO() });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo aplicar el cambio.');
    } finally {
      setSaving(false);
    }
  }

  const row = (label, a, b, fmt) => (
    <div className="grid grid-cols-3 gap-2 mb-1.5 items-baseline">
      <span style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{label}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.inkSoft, textAlign: 'right' }}>{a === null ? '—' : fmt(a)}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink, fontWeight: 700, textAlign: 'right' }}>{b === null ? '—' : fmt(b)}</span>
    </div>
  );
  const money = (v) => formatMoney(v, currency);

  return (
    <Modal title={`Rediferir — ${plan.description}`} wide onClose={onClose}>
      <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Vuelve a repartir el capital que sigue diferido ({money(before.outstanding)}) en otro plazo y/o con otra tasa. Las cuotas ya facturadas no cambian.
      </p>
      <RateField label="Nueva tasa de interés" value={rateValue} type={rateType}
        onChange={(v, t) => { setRateValue(t === rateType ? v : String(Math.round(fromEffectiveAnnual(toEffectiveAnnual(num(v), rateType), t) * 10000) / 10000)); setRateType(t); }} />
      <Field label="Cuántas cuotas faltarán (plazo nuevo)">
        <input style={inputStyle} type="number" min="1" max="120" value={installments} onChange={(e) => setInstallments(e.target.value)} />
      </Field>
      <Field label="Abono a capital de este diferido (opcional)">
        <input style={inputStyle} type="number" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" />
      </Field>
      {r && (
        <div className="rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <span />
            <span style={{ fontSize: 11, color: T.inkSoft, textAlign: 'right', fontWeight: 600 }}>Antes</span>
            <span style={{ fontSize: 11, color: T.teal, textAlign: 'right', fontWeight: 700 }}>Después</span>
          </div>
          {row('Capital diferido', r.balanceBefore, r.balanceAfter, money)}
          {row('Tasa E.A.', plan.annualRate, newRate, fmtPct)}
          {row('Cuotas que faltan', remaining, r.plan.status === 'pagado' ? 0 : n, (v) => v)}
          {row('Valor de la cuota', inst(r.before), inst(r.after), money)}
          {row('Intereses por pagar', r.before.remainingInterest, r.after.remainingInterest, money)}
          {row('Última cuota', r.before.lastDueDate, r.after.lastDueDate, (v) => formatDate(v))}
        </div>
      )}
      {extraPayment > 0 && (
        <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">El abono solo cambia el plan. El dinero lo pagas aparte con "Pagar tarjeta" para que baje tu deuda real.</p>
      )}
      <Field label="Nota (opcional)">
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Rediferido en el banco a 24 cuotas" />
      </Field>
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Aplicando…' : 'Aplicar cambio'}</PrimaryButton>
    </Modal>
  );
}
