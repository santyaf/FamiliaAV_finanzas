import React, { useEffect, useMemo, useState } from 'react';
import { Users2, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, GhostButton, ProgressBar, IconButton } from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { todayISO } from '../lib/finance';
import { shiftMonth } from '../lib/calendar';
import { buildMonthlyReview, previousMonthKey, newDecision, toggleDecision, removeDecision } from '../lib/monthlyReview';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const STEPS = ['Resumen', 'En qué se fue', 'Presupuestos y metas', 'Logros y alertas', 'Decisiones'];
const label = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const arrow = (n) => (n === null ? '' : n > 0 ? `▲ ${n} %` : n < 0 ? `▼ ${Math.abs(n)} %` : '= igual');

// Gestión → Reunión mensual: un recorrido guiado por el mes para revisarlo juntos y dejar decisiones.
export function ReunionMensual({ data, actions }) {
  const today = todayISO();
  const [monthKey, setMonthKey] = useState(() => (Number(today.slice(8, 10)) <= 10 ? previousMonthKey(today.slice(0, 7)) : today.slice(0, 7)));
  const hasShared = data.accounts.some((a) => a.type === 'shared');
  const [scope, setScope] = useState(hasShared ? 'hogar' : 'todo');
  const [step, setStep] = useState(0);
  const [decisions, setDecisions] = useState(null);
  const [lastDecisions, setLastDecisions] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const currency = data.currency;
  const money = (n) => formatMoney(n, currency);

  const transactions = useMemo(() => {
    if (scope === 'todo') return data.transactions;
    const shared = new Set(data.accounts.filter((a) => a.type === 'shared').map((a) => a.id));
    return data.transactions.filter((t) => t.isShared || shared.has(t.accountId));
  }, [data.transactions, data.accounts, scope]);

  const review = useMemo(() => buildMonthlyReview({ monthKey, transactions, categories: data.categories, budgets: data.budgets, goals: data.goals }), [monthKey, transactions, data.categories, data.budgets, data.goals]);

  useEffect(() => {
    let alive = true;
    setDecisions(null); setError('');
    Promise.all([actions.loadMonthlyReview(monthKey), actions.loadMonthlyReview(previousMonthKey(monthKey))])
      .then(([cur, prev]) => { if (alive) { setDecisions(cur); setLastDecisions(prev); } })
      .catch((e) => { if (alive) { setDecisions([]); setError(e.message || 'No se pudieron cargar las decisiones.'); } });
    return () => { alive = false; };
  }, [monthKey]);

  async function persist(monthOfList, list, setter) {
    setter(list);
    try { await actions.saveMonthlyDecisions(monthOfList, list); setError(''); }
    catch (e) { setError(e.message || 'No se pudo guardar. Revisa tu conexión.'); }
  }
  const add = () => { if (!text.trim()) return; persist(monthKey, [...(decisions || []), newDecision(text)], setDecisions); setText(''); };

  const Change = ({ value }) => value === null ? null : <span style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}> {arrow(value)} vs mes anterior</span>;

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center gap-2 mb-1"><Users2 size={18} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Reunión mensual</p></div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Revisen el mes juntos, paso a paso, y dejen decisiones para el siguiente.</p>

      <Card style={{ marginBottom: 12 }}>
        <div className="flex items-center justify-between">
          <button onClick={() => { setMonthKey(shiftMonth(monthKey, -1)); setStep(0); }} aria-label="Mes anterior" className="p-1.5"><ChevronLeft size={18} color={T.ink} /></button>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, color: T.ink, textTransform: 'capitalize' }}>{label(monthKey)}</p>
          <button onClick={() => { setMonthKey(shiftMonth(monthKey, 1)); setStep(0); }} aria-label="Mes siguiente" className="p-1.5"><ChevronRight size={18} color={T.ink} /></button>
        </div>
        {hasShared && (
          <div className="flex gap-2 mt-2 justify-center">
            {[['hogar', 'Lo compartido'], ['todo', 'Todo lo que veo']].map(([id, l]) => (
              <button key={id} onClick={() => setScope(id)} aria-pressed={scope === id} className="rounded-full px-3 py-1" style={{ background: scope === id ? T.ink : T.bg, border: `1px solid ${scope === id ? T.ink : T.border}` }}>
                <span style={{ fontSize: 12, color: scope === id ? '#fff' : T.inkSoft, fontFamily: FONT_BODY }}>{l}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1 mt-3">{STEPS.map((s, i) => <button key={s} onClick={() => setStep(i)} aria-label={`Paso ${i + 1}: ${s}`} className="flex-1" style={{ height: 5, borderRadius: 3, background: i <= step ? T.teal : T.border }} />)}</div>
        <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1.5">Paso {step + 1} de {STEPS.length} · <strong style={{ color: T.ink }}>{STEPS[step]}</strong></p>
      </Card>

      {!review.hasData && step < 4 ? (
        <Card><p style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }}>No hay ingresos ni gastos registrados en {label(monthKey)}{scope === 'hogar' ? ' en las cuentas compartidas' : ''}. Cambien de mes o de vista.</p></Card>
      ) : (
        <>
          {step === 0 && (
            <Card>
              {[['Ingresos', review.totals.income, review.change.income, T.teal], ['Gastos', review.totals.expense, review.change.expense, T.coral]].map(([name, v, ch, color]) => (
                <div key={name} className="mb-3">
                  <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{name}</p>
                  <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 22, color }}>{money(v)}<Change value={ch} /></p>
                </div>
              ))}
              <div className="pt-2" style={{ borderTop: `1px solid ${T.border}` }}>
                <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Quedó</p>
                <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 22, color: review.totals.net >= 0 ? T.teal : T.danger }}>{money(review.totals.net)}{review.totals.savingsRate !== null && <span style={{ fontSize: 12, color: T.inkSoft }}> · {review.totals.savingsRate} % de los ingresos</span>}</p>
              </div>
              {(review.debt.capitalPaid > 0 || review.debt.interestPaid > 0) && <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-3">Deudas: pagaron {money(review.debt.capitalPaid)} a capital y {money(review.debt.interestPaid)} en intereses.</p>}
              <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">Solo ingresos y gastos operativos (sin préstamos, capital de deudas ni inversión).</p>
            </Card>
          )}

          {step === 1 && (
            <>
              <Card style={{ marginBottom: 12 }}>
                <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Gasto por categoría</p>
                {review.topCategories.map((c) => (
                  <div key={c.categoryId} className="mb-2.5">
                    <div className="flex items-center justify-between"><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{c.name}</span><span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink }}>{money(c.amount)}</span></div>
                    <ProgressBar value={c.share} color={T.coral} height={5} />
                    <p style={{ fontSize: 11, color: T.inkSoft }}>{c.share} % del gasto{c.changePct !== null ? ` · ${arrow(c.changePct)} vs mes anterior` : ''}</p>
                  </div>
                ))}
              </Card>
              <Card>
                <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Los gastos más grandes</p>
                {review.biggestExpenses.length === 0 && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Sin gastos puntuales este mes.</p>}
                {review.biggestExpenses.map((g) => (
                  <div key={g.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
                    <div><p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{g.description}</p><p style={{ fontSize: 11, color: T.inkSoft }}>{formatDate(g.date)}</p></div>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.coral }}>{money(g.amount)}</span>
                  </div>
                ))}
              </Card>
            </>
          )}

          {step === 2 && (
            <>
              <Card style={{ marginBottom: 12 }}>
                <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Presupuestos</p>
                {review.budgets.length === 0 && <p style={{ fontSize: 12.5, color: T.inkSoft }}>No tienen presupuestos. Créenlos en Gestión → Presupuestos.</p>}
                {review.budgets.map((b) => (
                  <div key={b.budgetId} className="mb-2.5">
                    <div className="flex items-center justify-between"><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{b.name}</span><span style={{ fontFamily: FONT_MONO, fontSize: 12, color: b.status === 'pasado' ? T.danger : T.ink }}>{money(b.spent)} / {money(b.limit)}</span></div>
                    <ProgressBar value={b.pct} color={b.status === 'pasado' ? T.danger : b.status === 'justo' ? T.gold : T.teal} height={5} />
                    <p style={{ fontSize: 11, color: b.status === 'pasado' ? T.danger : T.inkSoft }}>{b.pct} % del límite{b.status === 'pasado' ? ' — se pasaron' : b.status === 'justo' ? ' — justo' : ''}</p>
                  </div>
                ))}
              </Card>
              <Card>
                <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Metas de ahorro</p>
                {review.goals.length === 0 && <p style={{ fontSize: 12.5, color: T.inkSoft }}>No tienen metas todavía.</p>}
                {review.goals.map((g) => (
                  <div key={g.goalId} className="mb-2.5">
                    <div className="flex items-center justify-between"><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{g.name}</span><span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_MONO }}>{g.progress} %</span></div>
                    <ProgressBar value={g.progress} color={T.teal} height={5} />
                    <p style={{ fontSize: 11, color: T.inkSoft }}>{g.contributed > 0 ? `Aportaron ${money(g.contributed)} este mes · ` : 'Sin aportes este mes · '}faltan {money(g.remaining)}</p>
                  </div>
                ))}
              </Card>
            </>
          )}

          {step === 3 && (
            <>
              <Card style={{ marginBottom: 12, background: T.tealSoft, border: 'none' }}>
                <div className="flex items-center gap-2 mb-2"><CheckCircle2 size={16} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Lo que salió bien</p></div>
                {review.wins.length === 0 ? <p style={{ fontSize: 12.5, color: T.inkSoft }}>Este mes no hay logros claros que destacar.</p> : review.wins.map((w) => <p key={w} style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }} className="mb-1">• {w}</p>)}
              </Card>
              <Card style={{ background: T.goldSoft, border: 'none' }}>
                <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} color={T.gold} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Para mirar de cerca</p></div>
                {review.watch.length === 0 ? <p style={{ fontSize: 12.5, color: T.inkSoft }}>Nada preocupante este mes.</p> : review.watch.map((w) => <p key={w} style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }} className="mb-1">• {w}</p>)}
              </Card>
            </>
          )}

          {step === 4 && (
            <>
              {lastDecisions.length > 0 && (
                <Card style={{ marginBottom: 12 }}>
                  <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Decisiones de {label(previousMonthKey(monthKey))}: ¿se cumplieron?</p>
                  {lastDecisions.map((d) => (
                    <label key={d.id} className="flex items-center gap-2 py-1">
                      <input type="checkbox" checked={d.done} onChange={() => persist(previousMonthKey(monthKey), toggleDecision(lastDecisions, d.id), setLastDecisions)} />
                      <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, textDecoration: d.done ? 'line-through' : 'none' }}>{d.text}</span>
                    </label>
                  ))}
                </Card>
              )}
              <Card>
                <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-1">Decisiones para el próximo mes</p>
                <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Cosas concretas que van a hacer distinto. Las verán todos los del hogar y se revisan en la próxima reunión.</p>
                {decisions === null && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Cargando…</p>}
                {decisions?.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 py-1">
                    <input type="checkbox" checked={d.done} onChange={() => persist(monthKey, toggleDecision(decisions, d.id), setDecisions)} aria-label={`Hecha: ${d.text}`} />
                    <span className="flex-1" style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, textDecoration: d.done ? 'line-through' : 'none' }}>{d.text}</span>
                    <IconButton icon={Trash2} variant="danger" size={13} onClick={() => persist(monthKey, removeDecision(decisions, d.id), setDecisions)} label={`Quitar: ${d.text}`} />
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input style={{ ...inputStyle, flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Ej. Bajar el gasto en domicilios a $150.000" aria-label="Nueva decisión" />
                  <button onClick={add} aria-label="Agregar decisión" className="flex items-center justify-center" style={{ background: T.teal, borderRadius: 10, minWidth: 44, height: 44 }}><Plus size={18} color="#fff" /></button>
                </div>
                {error && <p role="alert" style={{ color: T.danger, fontSize: 12 }} className="mt-2">{error}</p>}
              </Card>
            </>
          )}
        </>
      )}

      <div className="flex gap-2 mt-4">
        <GhostButton onClick={() => setStep(Math.max(0, step - 1))} style={{ flex: 1, opacity: step === 0 ? 0.4 : 1 }}>Atrás</GhostButton>
        <PrimaryButton onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))} style={{ flex: 2, opacity: step === STEPS.length - 1 ? 0.4 : 1 }}>Siguiente</PrimaryButton>
      </div>
    </div>
  );
}
