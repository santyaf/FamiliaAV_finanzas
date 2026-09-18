import React, { useState, useEffect } from 'react';
import { CreditCard, Percent, ShieldCheck, Check, ChevronRight, Info, Pencil, Plus, Trash2, Briefcase, Undo2, History } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import {
  Card, PrimaryButton, GhostButton, IconButton, ProgressBar, Modal, Field, EmptyState,
} from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { todayISO, creditOutstandingBalance } from '../lib/finance';
import {
  annualToMonthlyRate, RATE_TYPES, toEffectiveAnnual, fromEffectiveAnnual, buildRefinance, summarizeSchedule,
} from '../lib/amortization';
import { libranzaDeductionsForMonth, CREDIT_EVENT_LABELS, installmentInCop } from '../lib/creditRules';

function addOneYear(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const CREDIT_TYPE_LABELS = { vivienda: 'Vivienda', vehiculo: 'Vehículo', libre_inversion: 'Libre inversión', educativo: 'Educativo', otro: 'Otro' };
const INSURANCE_TYPE_LABELS = { vida: 'Vida (todos los créditos)', incendio_terremoto: 'Incendio y terremoto (vivienda)', desempleo: 'Desempleo', otro: 'Otro' };

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const fmtPct = (v) => `${(Math.round(v * 100) / 100).toLocaleString('es-CO')}%`;

// Tasa como la dice el banco (E.A., efectiva mensual o nominal mes vencido). Los
// créditos se guardan siempre en E.A.; aquí se muestra a qué equivale.
export function RateField({ label = 'Tasa de interés', value, type, onChange }) {
  const ea = toEffectiveAnnual(num(value), type);
  const monthly = annualToMonthlyRate(ea) * 100;
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input style={{ ...inputStyle, flex: 1 }} type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value, type)} placeholder="Ej. 1.8" />
        <select style={{ ...inputStyle, width: 'auto', flexShrink: 0 }} value={type} onChange={(e) => onChange(value, e.target.value)}>
          {RATE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.id === 'EA' ? 'E.A.' : t.id === 'EM' ? 'E.M. (mensual)' : 'N.M.V.'}</option>)}
        </select>
      </div>
      {num(value) > 0 && (
        <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">
          Equivale a {fmtPct(ea)} efectiva anual · {fmtPct(monthly)} efectiva mensual. {RATE_TYPES.find((t) => t.id === type).label}.
        </p>
      )}
    </Field>
  );
}

// Cómo se paga el crédito: desde una cuenta, o por libranza (la cuota la descuenta el
// empleador de la nómina).
function PaymentSourceFields({ source, setSource, employer, setEmployer, payrollDay, setPayrollDay, autoRegister, setAutoRegister }) {
  return (
    <>
      <Field label="¿Cómo se paga?">
        <div className="flex flex-col gap-2">
          {[['cuenta', 'Desde una cuenta (yo pago cada cuota)'], ['libranza', 'Libranza — la cuota se descuenta de mi nómina']].map(([id, text]) => (
            <label key={id} className="flex items-center gap-2 rounded-xl p-3" style={{ background: source === id ? T.tealSoft : T.bg, border: `1px solid ${source === id ? T.teal : T.border}` }}>
              <input type="radio" checked={source === id} onChange={() => setSource(id)} />
              <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{text}</span>
            </label>
          ))}
        </div>
      </Field>
      {source === 'libranza' && (
        <div className="rounded-xl p-3 mb-4" style={{ background: T.bg }}>
          <Field label="Empleador / pagaduría (opcional)">
            <input style={inputStyle} value={employer} onChange={(e) => setEmployer(e.target.value)} placeholder="Ej. Mi empresa S.A.S." />
          </Field>
          <Field label="Día del mes en que se descuenta de la nómina">
            <input style={inputStyle} type="number" min="1" max="31" value={payrollDay} onChange={(e) => setPayrollDay(e.target.value)} placeholder="Ej. 30" />
          </Field>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={autoRegister} onChange={(e) => setAutoRegister(e.target.checked)} style={{ marginTop: 2 }} />
            <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>
              Registrar el descuento automáticamente cuando venza la cuota
              <span style={{ display: 'block', fontSize: 11, color: T.inkSoft }}>Al abrir la app se registra como pagada (capital + intereses) en la cuenta donde cae tu salario. Registra tu salario BRUTO como ingreso: así el descuento no lo cuenta dos veces.</span>
            </span>
          </label>
        </div>
      )}
    </>
  );
}

const PAYMENT_LABEL = (c) => (c.paymentSource === 'libranza'
  ? `Libranza${c.payrollEmployer ? ` · ${c.payrollEmployer}` : ''}${c.payrollDay ? ` · descuento el día ${c.payrollDay}` : ''}` : null);

export function Creditos({ data, actions, setModal }) {
  const [credits, setCredits] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [payrollRows, setPayrollRows] = useState([]); // descuentos de nómina de este mes

  async function refresh() {
    const list = await actions.loadCredits();
    setCredits(list);
    const libranzas = list.filter((c) => c.paymentSource === 'libranza' && c.status !== 'pagado');
    const byCredit = {};
    await Promise.all(libranzas.map(async (c) => { byCredit[c.id] = await actions.loadCreditPayments(c.id); }));
    setPayrollRows(libranzaDeductionsForMonth(list, byCredit, todayISO().slice(0, 7)));
  }
  useEffect(() => { refresh(); }, []);

  if (selectedId) {
    const credit = credits?.find((c) => c.id === selectedId);
    if (!credit) return null;
    return <CreditDetail data={data} actions={actions} credit={credit} setModal={setModal}
      onBack={() => setSelectedId(null)}
      onDeleted={() => { setSelectedId(null); refresh(); }} />;
  }

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Créditos</p>
        <PrimaryButton onClick={() => setModal({ type: 'credit', onCreated: refresh })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nuevo</PrimaryButton>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Un crédito marcado como individual solo lo ves tú; si lo dejas sin integrante específico, todo el hogar lo verá.
      </p>

      {payrollRows.length > 0 && (
        <Card style={{ marginBottom: 14, background: T.tealSoft, border: 'none' }}>
          <div className="flex items-center gap-2 mb-1"><Briefcase size={15} color={T.teal} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Descuentos de nómina este mes</span></div>
          {payrollRows.map((r) => (
            <p key={`${r.creditId}-${r.installmentNumber}`} style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }} className="mb-0.5">
              {r.name} · cuota {r.installmentNumber} · {formatDate(r.dueDate)} · <span style={{ fontFamily: FONT_MONO }}>{formatMoney(r.total, data.currency)}</span>{r.paid ? ' · registrada' : ''}
            </p>
          ))}
          <p style={{ fontSize: 12, fontFamily: FONT_MONO, fontWeight: 700, color: T.ink }} className="mt-1">Total: {formatMoney(payrollRows.reduce((s2, r) => s2 + r.total, 0), data.currency)}</p>
        </Card>
      )}
      {credits === null && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Cargando…</p>}
      {credits?.length === 0 && <EmptyState icon={<CreditCard size={36} color={T.teal} />} title="Sin créditos registrados" subtitle="Agrega tu primer crédito para llevar el control de cuotas, intereses y seguros." />}

      <div className="flex flex-col gap-3">
        {credits?.map((c) => (
          <Card key={c.id} style={{ cursor: 'pointer' }}>
            <div onClick={() => setSelectedId(c.id)}>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: T.ink }}>{c.name}</p>
                  <p style={{ fontSize: 11.5, color: T.inkSoft }}>{CREDIT_TYPE_LABELS[c.creditType] || 'Crédito'} · {c.currency} · {c.amortizationSystem === 'frances' ? 'Sistema francés' : 'Sistema alemán'}</p>
                  {PAYMENT_LABEL(c) && <p style={{ fontSize: 11, color: T.teal, fontFamily: FONT_BODY }}>{PAYMENT_LABEL(c)}</p>}
                </div>
                <span className="rounded-full px-2 py-1" style={{ background: c.status === 'pagado' ? T.tealSoft : T.coralSoft }}>
                  <span style={{ fontSize: 10.5, color: c.status === 'pagado' ? T.teal : T.coral, fontFamily: FONT_BODY, fontWeight: 600 }}>{c.status === 'pagado' ? 'Pagado' : 'Activo'}</span>
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>{fmtPct(c.annualRate)} E.A. · {c.termMonths} cuotas · monto original</span>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 15, color: T.ink }}>{formatMoney(c.principal, c.currency === 'UVR' ? undefined : data.currency)}{c.currency === 'UVR' ? ' UVR' : ''}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function CreditDetail({ data, actions, credit, setModal, onBack, onDeleted }) {
  const [payments, setPayments] = useState(null);
  const [extras, setExtras] = useState(null);
  const [insurances, setInsurances] = useState(null);
  const [events, setEvents] = useState([]);
  const [showAll, setShowAll] = useState(false);

  async function refresh() {
    const [p, e, ins, ev] = await Promise.all([
      actions.loadCreditPayments(credit.id), actions.loadCreditExtraPayments(credit.id), actions.loadCreditInsurances(credit.id),
      actions.loadCreditEvents(credit.id).catch(() => []),
    ]);
    setPayments(p); setExtras(e); setInsurances(ins); setEvents(ev);
  }
  useEffect(() => { refresh(); }, [credit.id]);

  async function remove() {
    if (!confirm(`¿Eliminar el crédito "${credit.name}"? Se borrará también su tabla de amortización.`)) return;
    await actions.deleteCredit(credit.id);
    onDeleted();
  }
  async function removeInsurance(id) {
    if (!confirm('¿Eliminar este seguro? Se recalculará el valor de las cuotas pendientes.')) return;
    await actions.removeCreditInsurance(id, credit.id);
    await refresh();
  }

  async function revertLastPayment() {
    const lastPaid = [...(payments || [])].filter((p) => p.paid).sort((a, b) => a.installmentNumber - b.installmentNumber).pop();
    if (!lastPaid) return;
    if (!confirm(`¿Revertir el pago de la cuota ${lastPaid.installmentNumber}? Vuelve a quedar pendiente y se borran los movimientos que se registraron con ese pago.`)) return;
    try {
      await actions.unmarkInstallmentPaid(credit, lastPaid, payments);
      await refresh();
    } catch (e) {
      alert(e.message || 'No se pudo revertir el pago.');
    }
  }

  const paidCount = payments?.filter((p) => p.paid).length || 0;
  const totalCount = payments?.length || 0;
  const nextUnpaid = payments?.find((p) => !p.paid);
  const pendingInterest = (payments || []).filter((p) => !p.paid).reduce((s2, p) => s2 + p.interest, 0);
  const currentBalance = creditOutstandingBalance(credit, payments);
  const money = (v) => credit.currency === 'UVR' ? `${v.toLocaleString('es-CO', { maximumFractionDigits: 2 })} UVR` : formatMoney(v, data.currency);

  const visiblePayments = showAll ? payments : payments?.slice(0, 6);
  const activeInsuranceTotal = (insurances || []).filter((i) => i.active && i.validFrom <= todayISO() && todayISO() <= i.validTo).reduce((s, i) => s + i.monthlyValue, 0);

  return (
    <div className="pb-4 pt-2">
      <button onClick={onBack} className="flex items-center gap-1 mb-3">
        <ChevronRight size={16} color={T.inkSoft} style={{ transform: 'rotate(180deg)' }} />
        <span style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }}>Créditos</span>
      </button>

      <Card style={{ marginBottom: 16 }}>
        <div className="flex items-start justify-between mb-2">
          <div>
            <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: T.ink }}>{credit.name}</p>
            <p style={{ fontSize: 12, color: T.inkSoft }}>{CREDIT_TYPE_LABELS[credit.creditType] || 'Crédito'} · {credit.currency} · {credit.amortizationSystem === 'frances' ? 'Sistema francés' : 'Sistema alemán'}</p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton icon={Pencil} onClick={() => setModal({ type: 'editCredit', payload: { credit, payments }, onDone: refresh })} label="Editar crédito" />
            <IconButton icon={Trash2} variant="danger" onClick={remove} label="Eliminar crédito" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <p style={{ fontSize: 11, color: T.inkSoft }}>Saldo actual</p>
            <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 17, color: T.ink }}>{money(currentBalance)}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: T.inkSoft }}>Progreso</p>
            <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 17, color: T.ink }}>{paidCount}/{totalCount} cuotas</p>
          </div>
        </div>
        <ProgressBar value={(paidCount / (totalCount || 1)) * 100} color={T.teal} />
        <div className="flex items-center gap-3 mt-3">
          <span className="flex items-center gap-1"><Percent size={12} color={T.inkSoft} /><span style={{ fontSize: 11.5, color: T.inkSoft }}>{fmtPct(credit.annualRate)} E.A. ({fmtPct(annualToMonthlyRate(credit.annualRate) * 100)} mensual)</span></span>
          {activeInsuranceTotal > 0 && <span className="flex items-center gap-1"><ShieldCheck size={12} color={T.inkSoft} /><span style={{ fontSize: 11.5, color: T.inkSoft }}>Seguros {money(activeInsuranceTotal)}/mes</span></span>}
        </div>
        {PAYMENT_LABEL(credit) && (
          <p className="flex items-center gap-1 mt-2" style={{ fontSize: 11.5, color: T.teal, fontFamily: FONT_BODY }}><Briefcase size={12} /> {PAYMENT_LABEL(credit)}{credit.autoRegister ? ' · se registra solo al vencer' : ''}</p>
        )}
        {pendingInterest > 0 && <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Intereses que faltan por pagar: {money(pendingInterest)}</p>}
        {credit.status !== 'pagado' && (
          <>
            <div className="flex gap-2 mt-4">
              <GhostButton full onClick={() => setModal({ type: 'extraPayment', payload: { credit, payments }, onDone: refresh })}>Abono a capital</GhostButton>
              <GhostButton full onClick={() => setModal({ type: 'refinanceCredit', payload: { credit, payments }, onDone: refresh })}>Retanquear / rediferir</GhostButton>
            </div>
            {nextUnpaid && (
              <PrimaryButton full style={{ marginTop: 8 }} onClick={() => setModal({ type: 'payInstallment', payload: { credit, installment: nextUnpaid }, onDone: refresh })}>
                {credit.paymentSource === 'libranza' ? `Registrar descuento de nómina — cuota ${nextUnpaid.installmentNumber}` : `Pagar cuota ${nextUnpaid.installmentNumber}`}
              </PrimaryButton>
            )}
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className="flex items-center justify-between mb-2">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Seguros</p>
          <IconButton icon={Plus} onClick={() => setModal({ type: 'creditInsurance', payload: credit, onDone: refresh })} color={T.teal} label="Agregar seguro" />
        </div>
        {(!insurances || insurances.length === 0) && <p style={{ fontSize: 12, color: T.inkSoft }}>Sin seguros registrados. Agrega vida, incendio/terremoto (vivienda) o desempleo, con su vigencia.</p>}
        {insurances?.map((ins) => {
          const vigente = ins.active && ins.validFrom <= todayISO() && todayISO() <= ins.validTo;
          return (
            <div key={ins.id} className="flex items-center justify-between mb-2 rounded-xl p-2.5" style={{ background: vigente ? T.tealSoft : T.bg }}>
              <div>
                <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{INSURANCE_TYPE_LABELS[ins.type]}</p>
                <p style={{ fontSize: 10.5, color: T.inkSoft }}>{formatDate(ins.validFrom)} → {formatDate(ins.validTo)} · {money(ins.monthlyValue)}/mes{!vigente ? ' · vencido' : ''}</p>
              </div>
              <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeInsurance(ins.id)} label="Eliminar seguro" />
            </div>
          );
        })}
        <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Se suman a la cuota de cada mes cubierto por su vigencia. Al renovar (o si se endosa un valor distinto), agrega uno nuevo con la vigencia actualizada.</p>
      </Card>

      {events.filter((e) => e.kind !== 'abono').length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div className="flex items-center gap-2 mb-2"><History size={14} color={T.ink} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Historial del crédito</p></div>
          {events.filter((e) => e.kind !== 'abono').map((e) => (
            <div key={e.id} className="mb-2.5">
              <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{CREDIT_EVENT_LABELS[e.kind] || e.kind} · {formatDate(e.date)}{e.amount ? ` · ${money(e.amount)}` : ''}</p>
              {(e.rateBefore !== null && e.rateAfter !== null && e.rateBefore !== e.rateAfter) && <p style={{ fontSize: 11, color: T.inkSoft }}>Tasa: {fmtPct(e.rateBefore)} → {fmtPct(e.rateAfter)} E.A.</p>}
              {(e.installmentBefore !== null && e.installmentAfter !== null) && <p style={{ fontSize: 11, color: T.inkSoft }}>Cuota: {money(e.installmentBefore)} → {money(e.installmentAfter)}{e.termBefore !== null && e.termAfter !== null ? ` · cuotas que faltan: ${e.termBefore} → ${e.termAfter}` : ''}</p>}
              {(e.balanceBefore !== null && e.balanceAfter !== null && e.kind !== 'creacion') && <p style={{ fontSize: 11, color: T.inkSoft }}>Saldo: {money(e.balanceBefore)} → {money(e.balanceAfter)}</p>}
              {e.note && <p style={{ fontSize: 11, color: T.inkSoft }}>{e.note}</p>}
            </div>
          ))}
        </Card>
      )}

      {extras?.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Abonos a capital</p>
          {extras.map((e) => (
            <div key={e.id} className="flex items-center justify-between mb-1.5">
              <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>{formatDate(e.appliedDate)} · {e.strategy === 'reducir_plazo' ? 'redujo plazo' : 'redujo cuota'} · {e.byName}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.teal }}>{money(e.amount)}</span>
            </div>
          ))}
        </Card>
      )}

      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Tabla de amortización</p>
      {!payments && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Cargando…</p>}
      <div className="flex flex-col gap-1.5">
        {visiblePayments?.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: p.paid ? T.tealSoft : T.surface, border: `1px solid ${p.paid ? T.tealSoft : T.border}` }}>
            <div>
              <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Cuota {p.installmentNumber} · {formatDate(p.dueDate)}</p>
              <p style={{ fontSize: 10.5, color: T.inkSoft }}>Capital {money(p.capital)} · Interés {money(p.interest)}{p.insurance > 0 ? ` · Seguro ${money(p.insurance)}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.ink }}>{money(p.total)}</span>
              {p.paid && <Check size={14} color={T.teal} />}
            </div>
          </div>
        ))}
      </div>
      {payments?.length > 6 && (
        <button onClick={() => setShowAll(!showAll)} className="mt-3 block mx-auto">
          <span style={{ fontSize: 12.5, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>{showAll ? 'Ver menos' : `Ver las ${payments.length} cuotas`}</span>
        </button>
      )}
      {paidCount > 0 && (
        <button onClick={revertLastPayment} className="mt-3 flex items-center gap-1 mx-auto">
          <Undo2 size={13} color={T.inkSoft} /><span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>Revertir el último pago registrado</span>
        </button>
      )}
    </div>
  );
}

export function CreditModal({ data, actions, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [creditType, setCreditType] = useState('vivienda');
  const [currency, setCurrency] = useState('COP');
  const [defineBy, setDefineBy] = useState('total'); // total | installment
  const [principal, setPrincipal] = useState('');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [rateValue, setRateValue] = useState('');
  const [rateType, setRateType] = useState('EA');
  const [termMonths, setTermMonths] = useState('');
  const [amortizationSystem, setAmortizationSystem] = useState('frances');
  const [insuranceMonthly, setInsuranceMonthly] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [paymentSource, setPaymentSource] = useState('cuenta');
  const [payrollEmployer, setPayrollEmployer] = useState('');
  const [payrollDay, setPayrollDay] = useState('');
  const [autoRegister, setAutoRegister] = useState(true);
  const annualRate = rateValue === '' ? '' : String(toEffectiveAnnual(num(rateValue), rateType));
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [inProgress, setInProgress] = useState(false);
  const [installmentsAlreadyPaid, setInstallmentsAlreadyPaid] = useState('');
  const [registerDisbursement, setRegisterDisbursement] = useState(false);
  const [uvr, setUvr] = useState(null);
  const [loadingUvr, setLoadingUvr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (defineBy === 'installment') setAmortizationSystem('frances'); }, [defineBy]);
  // una libranza es personal: queda a nombre de quien la tiene
  useEffect(() => { if (paymentSource === 'libranza' && !ownerMemberId) setOwnerMemberId(actions.userId); }, [paymentSource]);

  // deriva el monto total del préstamo a partir de la cuota fija (solo sistema francés)
  function derivePrincipalFromInstallment() {
    const cuota = parseFloat(installmentAmount), r = parseFloat(annualRate), t = parseInt(termMonths, 10);
    if (!cuota || !r || !t) return 0;
    const i = annualToMonthlyRate(r);
    return i === 0 ? cuota * t : (cuota * (1 - Math.pow(1 + i, -t))) / i;
  }
  const derivedPrincipal = defineBy === 'installment' ? derivePrincipalFromInstallment() : null;

  async function fetchUvr() {
    setLoadingUvr(true);
    try {
      const r = await actions.getLatestUvr();
      setUvr(r);
    } finally {
      setLoadingUvr(false);
    }
  }
  useEffect(() => { if (currency === 'UVR' && !uvr) fetchUvr(); }, [currency]);

  async function save() {
    const p = defineBy === 'installment' ? derivedPrincipal : parseFloat(principal);
    const r = parseFloat(annualRate), t = parseInt(termMonths, 10);
    if (!name.trim() || !p || !r || !t) { setError('Completa nombre, monto (o cuota), tasa y plazo.'); return; }
    if (paymentSource === 'libranza' && (!payrollDay || num(payrollDay) < 1 || num(payrollDay) > 31)) { setError('Indica el día del mes en que se descuenta la libranza (1 a 31).'); return; }
    if (paymentSource === 'libranza' && !accountId) { setError('Elige la cuenta donde cae tu salario.'); return; }
    setSaving(true); setError('');
    try {
      await actions.createCredit({
        name: name.trim(), creditType, currency, principal: p, annualRate: r, termMonths: t,
        amortizationSystem, insuranceMonthly: parseFloat(insuranceMonthly) || 0, startDate,
        ownerMemberId: ownerMemberId || null, accountId: accountId || null,
        installmentsAlreadyPaid: inProgress ? (parseInt(installmentsAlreadyPaid, 10) || 0) : 0,
        registerDisbursement: registerDisbursement && !inProgress && currency !== 'UVR',
        paymentSource, payrollEmployer: payrollEmployer.trim(), payrollDay: paymentSource === 'libranza' ? parseInt(payrollDay, 10) : null, autoRegister,
      });
      onCreated?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo crear el crédito.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nuevo crédito" wide onClose={onClose}>
      <Field label="Nombre">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Crédito hipotecario" />
      </Field>
      <Field label="Tipo">
        <select style={inputStyle} value={creditType} onChange={(e) => setCreditType(e.target.value)}>
          {Object.entries(CREDIT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Moneda">
        <select style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="COP">COP — Pesos</option>
          <option value="UVR">UVR — Unidad de Valor Real</option>
        </select>
      </Field>
      {currency === 'UVR' && (
        <div className="rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
          {loadingUvr && <p style={{ fontSize: 12, color: T.teal }}>Consultando valor UVR…</p>}
          {uvr && <p style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY }}>UVR {formatDate(uvr.date)}: <b>${uvr.value.toLocaleString('es-CO')}</b> {uvr.cached ? '(último valor guardado)' : ''}</p>}
          {!uvr && !loadingUvr && <p style={{ fontSize: 12, color: T.danger }}>No se pudo obtener el valor UVR automáticamente. Ingresa el monto directamente en UVR; puedes registrar el valor del día en Ajustes.</p>}
        </div>
      )}
      <Field label="¿Cómo prefieres definirlo?">
        <div className="flex rounded-xl p-1" style={{ background: T.bg }}>
          <button type="button" onClick={() => setDefineBy('total')} className="flex-1 rounded-lg py-2" style={{ background: defineBy === 'total' ? T.surface : 'transparent', border: defineBy === 'total' ? `1px solid ${T.border}` : 'none' }}>
            <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Monto total</span>
          </button>
          <button type="button" onClick={() => setDefineBy('installment')} className="flex-1 rounded-lg py-2" style={{ background: defineBy === 'installment' ? T.surface : 'transparent', border: defineBy === 'installment' ? `1px solid ${T.border}` : 'none' }}>
            <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Valor de la cuota</span>
          </button>
        </div>
      </Field>
      {defineBy === 'total' ? (
        <Field label={`Monto del crédito (${currency})`}>
          <input style={inputStyle} type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="0" />
        </Field>
      ) : (
        <Field label={`Valor de la cuota (${currency}) — sistema francés`}>
          <input style={inputStyle} type="number" value={installmentAmount} onChange={(e) => setInstallmentAmount(e.target.value)} placeholder="0" />
        </Field>
      )}
      <RateField value={rateValue} type={rateType} onChange={(v, t) => { setRateValue(v); setRateType(t); }} />
      <Field label="Plazo (meses)">
        <input style={inputStyle} type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} placeholder="Ej. 180" />
      </Field>
      {defineBy === 'installment' && derivedPrincipal > 0 && (
        <div className="rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
          <p style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY }}>Monto del préstamo calculado: <b>{formatMoney(derivedPrincipal, currency === 'UVR' ? undefined : currency)}{currency === 'UVR' ? ' UVR' : ''}</b></p>
        </div>
      )}
      {defineBy === 'total' && (
        <Field label="Sistema de amortización">
          <select style={inputStyle} value={amortizationSystem} onChange={(e) => setAmortizationSystem(e.target.value)}>
            <option value="frances">Francés (cuota fija)</option>
            <option value="aleman">Alemán (abono a capital fijo)</option>
          </select>
        </Field>
      )}
      <Field label="Seguros mensuales (opcional)">
        <input style={inputStyle} type="number" value={insuranceMonthly} onChange={(e) => setInsuranceMonthly(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Fecha de inicio">
        <input style={inputStyle} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={inProgress} onChange={(e) => setInProgress(e.target.checked)} />
        <span style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY }}>Este crédito ya está en curso (ya pagué algunas cuotas)</span>
      </label>
      {inProgress && (
        <Field label="Cuotas ya pagadas">
          <input style={inputStyle} type="number" value={installmentsAlreadyPaid} onChange={(e) => setInstallmentsAlreadyPaid(e.target.value)} placeholder="Ej. 12" />
        </Field>
      )}
      {inProgress && (
        <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
          Generamos la tabla completa según el monto, tasa y plazo originales, y marcamos como pagadas las primeras {installmentsAlreadyPaid || 'N'} cuotas — sin crear gastos retroactivos en Movimientos.
        </p>
      )}
      <Field label="Responsable">
        <select style={inputStyle} value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
          <option value="">Compartido por todo el hogar</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>Solo {m.name} (privado)</option>)}
        </select>
      </Field>
      <PaymentSourceFields source={paymentSource} setSource={setPaymentSource} employer={payrollEmployer} setEmployer={setPayrollEmployer}
        payrollDay={payrollDay} setPayrollDay={setPayrollDay} autoRegister={autoRegister} setAutoRegister={setAutoRegister} />
      <Field label={paymentSource === 'libranza' ? 'Cuenta donde cae tu salario' : 'Cuenta desde donde se paga'}>
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {!inProgress && currency !== 'UVR' && (
        <label className="flex items-start gap-2 mb-4 rounded-xl p-3" style={{ background: registerDisbursement ? T.tealSoft : T.bg }}>
          <input type="checkbox" checked={registerDisbursement} onChange={(e) => setRegisterDisbursement(e.target.checked)} style={{ marginTop: 2 }} />
          <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>
            Recibí este préstamo ahora: registrar el desembolso como ingreso en la cuenta elegida
            <span style={{ display: 'block', fontSize: 11.5, color: T.inkSoft }}>Entra como "Préstamos recibidos" (financiamiento) y la deuda queda como pasivo en Créditos.</span>
          </span>
        </label>
      )}
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Creando…' : 'Crear crédito y generar tabla de amortización'}</PrimaryButton>
    </Modal>
  );
}

export function PayInstallmentModal({ data, actions, payload, onClose, onDone }) {
  const { credit, installment } = payload;
  const libranza = credit.paymentSource === 'libranza';
  const [accountId, setAccountId] = useState(credit.accountId || data.accounts[0]?.id || '');
  const [memberId, setMemberId] = useState(credit.ownerMemberId || data.members[0]?.id || '');
  const [paidDate, setPaidDate] = useState(libranza && installment.dueDate <= todayISO() ? installment.dueDate : todayISO());
  const [uvrValue, setUvrValue] = useState('');
  const deudasCat = data.categories.find((c) => c.name === 'Deudas y préstamos')?.id || data.categories.find((c) => c.type === 'expense')?.id;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isUvr = credit.currency === 'UVR';
  const money = (v) => isUvr ? `${v.toLocaleString('es-CO', { maximumFractionDigits: 2 })} UVR` : formatMoney(v, data.currency);

  // créditos en UVR: las cuotas están en UVR y se pagan en pesos al valor de la UVR de ese día
  useEffect(() => {
    if (isUvr) actions.getLatestUvr().then((r) => r && setUvrValue(String(r.value))).catch(() => {});
  }, []);
  let copPreview = null;
  try { copPreview = isUvr && num(uvrValue) > 0 ? installmentInCop(installment, credit, num(uvrValue)) : null; } catch { copPreview = null; }

  async function confirm() {
    if (isUvr && !(num(uvrValue) > 0)) { setError('Indica el valor de la UVR del día del pago para convertir la cuota a pesos.'); return; }
    setSaving(true); setError('');
    try {
      await actions.markInstallmentPaid(credit, installment, accountId, memberId, deudasCat, { paidDate, uvrValue: isUvr ? num(uvrValue) : undefined, libranza });
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={libranza ? `Descuento de nómina — cuota ${installment.installmentNumber}` : `Pagar cuota ${installment.installmentNumber}`} onClose={onClose}>
      <div className="rounded-xl p-3 mb-4" style={{ background: T.bg }}>
        <p style={{ fontSize: 12.5, color: T.inkSoft }} className="mb-1">Vence {formatDate(installment.dueDate)}</p>
        <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 20, color: T.ink }}>{money(installment.total)}</p>
        <p style={{ fontSize: 11, color: T.inkSoft }}>Capital {money(installment.capital)} · Interés {money(installment.interest)}{installment.insurance > 0 ? ` · Seguro ${money(installment.insurance)}` : ''}</p>
        {copPreview && <p style={{ fontSize: 12, color: T.teal, fontFamily: FONT_MONO }} className="mt-1">≈ {formatMoney(copPreview.total, data.currency)} al valor de la UVR indicado</p>}
      </div>
      {isUvr && (
        <Field label="Valor de la UVR el día del pago (COP)">
          <input style={inputStyle} type="number" step="0.0001" value={uvrValue} onChange={(e) => setUvrValue(e.target.value)} placeholder="Ej. 417.9009" />
        </Field>
      )}
      <Field label={libranza ? 'Fecha del descuento' : 'Fecha del pago'}>
        <input style={inputStyle} type="date" value={paidDate} max={todayISO()} onChange={(e) => setPaidDate(e.target.value)} />
      </Field>
      <Field label={libranza ? 'Cuenta donde cae tu salario' : 'Cuenta de pago'}>
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label={libranza ? 'Integrante al que le descuentan' : 'Integrante que paga'}>
        <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-4">
        Se registran dos movimientos: el capital como pago de deuda ("Deudas y préstamos", no cuenta como gasto en los informes) y los intereses y seguro como gasto ("Intereses y comisiones").
        {libranza ? ' Si tu salario lo registraste ya neto (después del descuento), no registres también este descuento: se contaría dos veces.' : ''}
      </p>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={confirm}>{saving ? 'Guardando…' : libranza ? 'Registrar descuento' : 'Confirmar pago'}</PrimaryButton>
    </Modal>
  );
}

export function ExtraPaymentModal({ data, actions, payload, onClose, onDone }) {
  const { credit, payments } = payload;
  const [amount, setAmount] = useState('');
  const [strategy, setStrategy] = useState('reducir_plazo');
  const [applyDate, setApplyDate] = useState(todayISO());
  const [registerAsExpense, setRegisterAsExpense] = useState(true);
  const [accountId, setAccountId] = useState(credit.accountId || data.accounts[0]?.id || '');
  const [memberId, setMemberId] = useState(credit.ownerMemberId || data.members[0]?.id || '');
  const deudasCat = data.categories.find((c) => c.name === 'Deudas y préstamos')?.id || data.categories.find((c) => c.type === 'expense')?.id;
  const [uvrValue, setUvrValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isUvr = credit.currency === 'UVR';
  useEffect(() => { if (isUvr) actions.getLatestUvr().then((r) => r && setUvrValue(String(r.value))).catch(() => {}); }, []);

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Ingresa un monto válido.'); return; }
    if (registerAsExpense && isUvr && !(num(uvrValue) > 0)) { setError('Indica el valor de la UVR para registrar el abono en pesos.'); return; }
    setSaving(true); setError('');
    try {
      await actions.applyExtraPayment(credit, payments, amt, strategy, applyDate, accountId, memberId, deudasCat, registerAsExpense, isUvr ? num(uvrValue) : undefined);
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo aplicar el abono.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Abono a capital" onClose={onClose}>
      <Field label={`Monto del abono (${credit.currency})`}>
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Fecha del abono">
        <input style={inputStyle} type="date" value={applyDate} onChange={(e) => setApplyDate(e.target.value)} />
      </Field>
      <Field label="¿Qué prefieres?">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 rounded-xl p-3" style={{ background: strategy === 'reducir_plazo' ? T.tealSoft : T.bg, border: `1px solid ${strategy === 'reducir_plazo' ? T.teal : T.border}` }}>
            <input type="radio" checked={strategy === 'reducir_plazo'} onChange={() => setStrategy('reducir_plazo')} />
            <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>Reducir el plazo (misma cuota, terminas antes)</span>
          </label>
          <label className="flex items-center gap-2 rounded-xl p-3" style={{ background: strategy === 'reducir_cuota' ? T.tealSoft : T.bg, border: `1px solid ${strategy === 'reducir_cuota' ? T.teal : T.border}` }}>
            <input type="radio" checked={strategy === 'reducir_cuota'} onChange={() => setStrategy('reducir_cuota')} />
            <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>Reducir el valor de la cuota (mismo plazo)</span>
          </label>
        </div>
      </Field>
      <label className="flex items-center gap-2 mb-3">
        <input type="checkbox" checked={registerAsExpense} onChange={(e) => setRegisterAsExpense(e.target.checked)} />
        <span style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>Registrar este abono en Movimientos (pago de deuda, no es gasto)</span>
      </label>
      {registerAsExpense && isUvr && (
        <Field label="Valor de la UVR el día del abono (COP)">
          <input style={inputStyle} type="number" step="0.0001" value={uvrValue} onChange={(e) => setUvrValue(e.target.value)} />
        </Field>
      )}
      {registerAsExpense && (
        <>
          <Field label="Cuenta de pago">
            <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Integrante que aporta">
            <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        </>
      )}
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Aplicando…' : 'Aplicar abono y recalcular'}</PrimaryButton>
    </Modal>
  );
}

export function EditCreditModal({ data, actions, payload, onClose, onDone }) {
  const { credit, payments } = payload;
  const [name, setName] = useState(credit.name);
  const [creditType, setCreditType] = useState(credit.creditType);
  const [rateValue, setRateValue] = useState(String(Math.round(credit.annualRate * 10000) / 10000));
  const [rateType, setRateType] = useState('EA');
  const [termMonths, setTermMonths] = useState(String(credit.termMonths));
  const [amortizationSystem, setAmortizationSystem] = useState(credit.amortizationSystem);
  const [ownerMemberId, setOwnerMemberId] = useState(credit.ownerMemberId || '');
  const [accountId, setAccountId] = useState(credit.accountId || data.accounts[0]?.id || '');
  const [paymentSource, setPaymentSource] = useState(credit.paymentSource || 'cuenta');
  const [payrollEmployer, setPayrollEmployer] = useState(credit.payrollEmployer || '');
  const [payrollDay, setPayrollDay] = useState(credit.payrollDay ? String(credit.payrollDay) : '');
  const [autoRegister, setAutoRegister] = useState(credit.paymentSource === 'libranza' ? credit.autoRegister : true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const newAnnualRate = toEffectiveAnnual(num(rateValue), rateType);
  const paidCount = payments.filter((p) => p.paid).length;
  const willRecalc = Math.abs(newAnnualRate - credit.annualRate) > 0.0001 || parseInt(termMonths, 10) !== credit.termMonths || amortizationSystem !== credit.amortizationSystem;

  async function save() {
    const t = parseInt(termMonths, 10);
    if (!name.trim() || !newAnnualRate || !t) { setError('Completa nombre, tasa y plazo.'); return; }
    if (t < paidCount) { setError(`El plazo no puede ser menor a las ${paidCount} cuotas que ya están pagadas.`); return; }
    if (paymentSource === 'libranza' && (!payrollDay || num(payrollDay) < 1 || num(payrollDay) > 31)) { setError('Indica el día del mes en que se descuenta la libranza (1 a 31).'); return; }
    if (willRecalc && !confirm('Esto recalculará las cuotas pendientes (las ya pagadas no se tocan). ¿Continuar?')) return;
    setSaving(true); setError('');
    try {
      await actions.updateCredit(credit.id, {
        name: name.trim(), creditType, annualRate: willRecalc ? newAnnualRate : credit.annualRate, termMonths: t, amortizationSystem,
        ownerMemberId: (paymentSource === 'libranza' && !ownerMemberId ? actions.userId : ownerMemberId) || null, accountId: accountId || null,
        paymentSource, payrollEmployer: payrollEmployer.trim(), payrollDay: paymentSource === 'libranza' ? parseInt(payrollDay, 10) : null, autoRegister,
      }, credit, payments);
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo actualizar el crédito.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Editar crédito" onClose={onClose}>
      <Field label="Nombre">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Tipo">
        <select style={inputStyle} value={creditType} onChange={(e) => setCreditType(e.target.value)}>
          {Object.entries(CREDIT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <RateField label="Tasa de interés (E.A. actual: se muestra abajo)" value={rateValue} type={rateType}
        onChange={(v, t) => { setRateValue(t === rateType ? v : String(Math.round(fromEffectiveAnnual(toEffectiveAnnual(num(v), rateType), t) * 10000) / 10000)); setRateType(t); }} />
      <Field label={`Plazo total (meses) — ya pagaste ${paidCount}`}>
        <input style={inputStyle} type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
      </Field>
      <Field label="Sistema de amortización">
        <select style={inputStyle} value={amortizationSystem} onChange={(e) => setAmortizationSystem(e.target.value)}>
          <option value="frances">Francés (cuota fija)</option>
          <option value="aleman">Alemán (abono a capital fijo)</option>
        </select>
      </Field>
      <Field label="Responsable">
        <select style={inputStyle} value={ownerMemberId} onChange={(e) => setOwnerMemberId(e.target.value)}>
          <option value="">Compartido por todo el hogar</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>Solo {m.name} (privado)</option>)}
        </select>
      </Field>
      <PaymentSourceFields source={paymentSource} setSource={setPaymentSource} employer={payrollEmployer} setEmployer={setPayrollEmployer}
        payrollDay={payrollDay} setPayrollDay={setPayrollDay} autoRegister={autoRegister} setAutoRegister={setAutoRegister} />
      <Field label={paymentSource === 'libranza' ? 'Cuenta donde cae tu salario' : 'Cuenta desde donde se paga'}>
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {willRecalc && (
        <div className="flex items-start gap-2 rounded-xl p-3 mb-4" style={{ background: T.amberSoft }}>
          <Info size={14} color={T.amber} style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 11.5, color: T.ink, fontFamily: FONT_BODY }}>Cambiaste la tasa, el plazo o el sistema — las cuotas pendientes se recalcularán desde el saldo actual. Las ya pagadas no cambian. (Si el banco te cambió las condiciones o recibiste dinero nuevo, usa "Retanquear / rediferir" para dejar el historial.)</p>
        </div>
      )}
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Guardar cambios'}</PrimaryButton>
    </Modal>
  );
}

// Retanqueo (dinero nuevo sobre el mismo crédito) o rediferido / reestructuración
// (nuevo plazo y/o tasa): cambia la cuota, el saldo y la tasa desde hoy. Muestra
// antes / después para decidir con las cifras a la vista.
export function RefinanceModal({ data, actions, payload, onClose, onDone }) {
  const { credit, payments } = payload;
  const unpaid = payments.filter((p) => !p.paid).sort((a, b) => a.installmentNumber - b.installmentNumber);
  const balance = creditOutstandingBalance(credit, payments);
  const [kind, setKind] = useState('retanqueo');
  const [topUp, setTopUp] = useState('');
  const [rateValue, setRateValue] = useState(String(Math.round(credit.annualRate * 10000) / 10000));
  const [rateType, setRateType] = useState('EA');
  const [termMonths, setTermMonths] = useState(String(unpaid.length));
  const [date, setDate] = useState(todayISO());
  const [registerDisbursement, setRegisterDisbursement] = useState(true);
  const [accountId, setAccountId] = useState(credit.accountId || data.accounts[0]?.id || '');
  const [memberId, setMemberId] = useState(credit.ownerMemberId || data.members[0]?.id || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isUvr = credit.currency === 'UVR';
  const money = (v) => isUvr ? `${v.toLocaleString('es-CO', { maximumFractionDigits: 2 })} UVR` : formatMoney(v, data.currency);

  const newRate = toEffectiveAnnual(num(rateValue), rateType);
  const terms = parseInt(termMonths, 10) || 0;
  const extra = kind === 'retanqueo' ? num(topUp) : 0;
  const before = summarizeSchedule(unpaid);
  const after = terms > 0 && newRate >= 0 ? buildRefinance({
    currentBalance: balance, topUp: extra, annualRate: newRate, termMonths: terms, system: credit.amortizationSystem,
    insuranceMonthly: credit.insuranceMonthly, firstDueDate: unpaid[0]?.dueDate, nextInstallmentNumber: unpaid[0]?.installmentNumber || 1,
  }) : null;

  async function save() {
    if (!terms || !(newRate >= 0) || !rateValue) { setError('Indica la tasa y cuántas cuotas faltarán.'); return; }
    if (kind === 'retanqueo' && !(extra > 0)) { setError('Indica cuánto dinero nuevo recibes.'); return; }
    setSaving(true); setError('');
    try {
      await actions.refinanceCredit(credit, payments, {
        kind, topUp: extra, annualRate: newRate, termMonths: terms, date, note: note.trim(),
        registerDisbursement: kind === 'retanqueo' && registerDisbursement && !isUvr, accountId, memberId,
      });
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo aplicar el cambio.');
    } finally {
      setSaving(false);
    }
  }

  const row = (label, a, b, fmt = (v) => v) => (
    <div className="grid grid-cols-3 gap-2 mb-1.5 items-baseline">
      <span style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{label}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.inkSoft, textAlign: 'right' }}>{fmt(a)}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink, fontWeight: 700, textAlign: 'right' }}>{b === null ? '—' : fmt(b)}</span>
    </div>
  );

  return (
    <Modal title="Retanquear / rediferir" wide onClose={onClose}>
      <div className="flex rounded-xl p-1 mb-4" style={{ background: T.bg }}>
        {[['retanqueo', 'Retanqueo (dinero nuevo)'], ['rediferido', 'Rediferir / reestructurar']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setKind(id)} className="flex-1 rounded-lg py-2" style={{ background: kind === id ? T.surface : 'transparent', border: kind === id ? `1px solid ${T.border}` : 'none' }}>
            <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{label}</span>
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        {kind === 'retanqueo'
          ? 'Recibes dinero nuevo sobre este mismo crédito: se suma al saldo y las cuotas que faltan se recalculan con el plazo y la tasa que definas.'
          : 'No entra dinero nuevo: cambias el plazo y/o la tasa del saldo actual (por ejemplo, para bajar la cuota). Las cuotas ya pagadas no cambian.'}
      </p>

      {kind === 'retanqueo' && (
        <Field label={`Dinero nuevo que recibes (${credit.currency})`}>
          <input style={inputStyle} type="number" value={topUp} onChange={(e) => setTopUp(e.target.value)} placeholder="0" />
        </Field>
      )}
      <RateField label="Nueva tasa de interés" value={rateValue} type={rateType}
        onChange={(v, t) => { setRateValue(t === rateType ? v : String(Math.round(fromEffectiveAnnual(toEffectiveAnnual(num(v), rateType), t) * 10000) / 10000)); setRateType(t); }} />
      <Field label="Cuántas cuotas faltarán (plazo nuevo)">
        <input style={inputStyle} type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
      </Field>
      <Field label="Fecha del cambio">
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      {after && (
        <div className="rounded-xl p-3 mb-4" style={{ background: T.tealSoft }}>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <span />
            <span style={{ fontSize: 11, color: T.inkSoft, textAlign: 'right', fontWeight: 600 }}>Antes</span>
            <span style={{ fontSize: 11, color: T.teal, textAlign: 'right', fontWeight: 700 }}>Después</span>
          </div>
          {row('Saldo', balance, after.newBalance, money)}
          {row('Tasa E.A.', credit.annualRate, newRate, fmtPct)}
          {row('Cuotas que faltan', before.count, after.summary.count)}
          {row('Valor de la cuota', before.firstTotal, after.summary.firstTotal, money)}
          {row('Intereses por pagar', before.totalInterest, after.summary.totalInterest, money)}
          {row('Última cuota', before.lastDueDate, after.summary.lastDueDate, (v) => (v ? formatDate(v) : '—'))}
        </div>
      )}

      {kind === 'retanqueo' && !isUvr && (
        <>
          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" checked={registerDisbursement} onChange={(e) => setRegisterDisbursement(e.target.checked)} />
            <span style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>Registrar el dinero recibido como ingreso (préstamo recibido)</span>
          </label>
          {registerDisbursement && (
            <>
              <Field label="Cuenta donde entra el dinero">
                <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Integrante que lo recibe">
                <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                  {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            </>
          )}
        </>
      )}
      <Field label="Nota (opcional)">
        <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Retanqueo aprobado por el banco, comisión $50.000" />
      </Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Aplicando…' : kind === 'retanqueo' ? 'Aplicar retanqueo' : 'Aplicar rediferido'}</PrimaryButton>
    </Modal>
  );
}

export function CreditInsuranceModal({ data, actions, payload: credit, onClose, onDone }) {
  const [type, setType] = useState('vida');
  const [monthlyValue, setMonthlyValue] = useState('');
  const [validFrom, setValidFrom] = useState(todayISO());
  const [validTo, setValidTo] = useState(addOneYear(todayISO()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const v = parseFloat(monthlyValue);
    if (!v || !validFrom || !validTo) { setError('Completa el valor mensual y la vigencia.'); return; }
    setSaving(true); setError('');
    try {
      await actions.addCreditInsurance(credit.id, { type, monthlyValue: v, validFrom, validTo });
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo agregar el seguro.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Agregar seguro" onClose={onClose}>
      <Field label="Tipo de seguro">
        <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(INSURANCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label={`Valor mensual (${credit.currency})`}>
        <input style={inputStyle} type="number" value={monthlyValue} onChange={(e) => setMonthlyValue(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Vigente desde">
        <input style={inputStyle} type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </Field>
      <Field label="Vigente hasta (renovación)">
        <input style={inputStyle} type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
      </Field>
      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">Cuando cambie el valor (renovación o endoso), agrega un seguro nuevo con la vigencia actualizada en vez de editar este.</p>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Agregar seguro'}</PrimaryButton>
    </Modal>
  );
}

export function MemberTransferModal({ data, actions, onClose }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [fromMemberId, setFromMemberId] = useState(data.members[0]?.id || '');
  const [fromAccountId, setFromAccountId] = useState(data.accounts[0]?.id || '');
  const [toMemberId, setToMemberId] = useState(data.members[1]?.id || data.members[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(data.accounts[0]?.id || '');
  const [date, setDate] = useState(todayISO());
  const [settlesDebt, setSettlesDebt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError('Ingresa un monto válido.'); return; }
    if (fromMemberId === toMemberId && fromAccountId === toAccountId) { setError('Elige un integrante o cuenta de destino distinto.'); return; }
    setSaving(true); setError('');
    try {
      await actions.addMemberTransfer({ amount: amt, description, fromMemberId, fromAccountId, toMemberId, toAccountId, date, settlesDebt });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo registrar la transferencia.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Transferencia entre integrantes" onClose={onClose}>
      <Field label="Descripción (opcional)">
        <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Mesada, préstamo entre hermanos…" />
      </Field>
      <Field label="Monto">
        <input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </Field>
      <Field label="De (integrante)">
        <select style={inputStyle} value={fromMemberId} onChange={(e) => setFromMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Desde la cuenta">
        <select style={inputStyle} value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Para (integrante)">
        <select style={inputStyle} value={toMemberId} onChange={(e) => setToMemberId(e.target.value)}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Hacia la cuenta">
        <select style={inputStyle} value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Fecha">
        <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <label className="flex items-start gap-2 mb-4 rounded-xl p-3" style={{ background: settlesDebt ? T.tealSoft : T.bg }}>
        <input type="checkbox" checked={settlesDebt} onChange={(e) => setSettlesDebt(e.target.checked)} style={{ marginTop: 2 }} />
        <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>Esta transferencia salda una deuda de gastos compartidos (afecta el balance en Conciliación)</span>
      </label>
      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">No cuenta como ingreso ni gasto, pero sí se refleja en tu balance personal. Marca la casilla solo si además está pagando una deuda de un gasto compartido.</p>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Registrar transferencia'}</PrimaryButton>
    </Modal>
  );
}
