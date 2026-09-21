import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Wallet, Users, Sparkles, Calendar, ChevronRight, AlertTriangle, Landmark,
} from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO } from '../ui/theme';
import { Card, ProgressBar, EmptyState, CategoryIcon } from '../ui/primitives';
import { AnomaliasCard } from './AnomaliasCard';
import { cardUsage, cardCycle, payToAvoidInterest } from '../lib/creditCards';
import { projectMonth, budgetAllowances } from '../lib/projection';
import { assetValueAt } from '../lib/assets';
import { SaludFinanciera } from './SaludFinanciera';
import { PrimerosPasos } from './PrimerosPasos';
import { formatMoney, formatDate } from '../lib/format';
import {
  thisMonthKey, daysUntil, occurrencesInMonth, getNextOccurrence, goalPriorityScore, todayISO,
  accountBalance, creditOutstandingBalance, daysLeftInMonth,
} from '../lib/finance';

export function DonutChart({ data, colors, size = 168, thickness = 30 }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gastos por categoría" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke={T.border} strokeWidth={thickness} opacity={0.35} />
      <g transform={`rotate(-90 ${c} ${c})`}>
        {total > 0 && data.map((d, i) => {
          const frac = (d.value || 0) / total;
          const seg = (
            <circle key={i} cx={c} cy={c} r={r} fill="none"
              stroke={colors[i % colors.length]} strokeWidth={thickness}
              strokeDasharray={`${Math.max(frac * circ - 2, 0)} ${circ}`}
              strokeDashoffset={-acc * circ} strokeLinecap="butt" />
          );
          acc += frac;
          return seg;
        })}
      </g>
    </svg>
  );
}

export function Dashboard({ data, update, actions, visibleTransactions, visibleMemberId, setModal, setTab }) {
  const mKey = thisMonthKey();
  const currency = data.currency;
  const myId = actions.userId;

  // Patrimonio neto = activos (saldo de cuentas + ahorrado en objetivos) -
  // pasivos (saldo pendiente de créditos activos). Los créditos en UVR se
  // convierten a la moneda del hogar con la última tasa conocida; mientras
  // esa tasa no ha llegado (o no hay ninguna guardada), se excluyen del
  // total y se avisa aparte para no subestimar la deuda en silencio.
  const creditsWithPayments = data.creditsWithPayments || [];
  const hasUvrCredits = creditsWithPayments.some((cp) => cp.credit.currency === 'UVR');
  const [uvrRate, setUvrRate] = useState(null);
  const [uvrFailed, setUvrFailed] = useState(false);
  useEffect(() => {
    if (hasUvrCredits && !uvrRate) {
      actions.getLatestUvr()
        .then((r) => (r ? setUvrRate(r) : setUvrFailed(true)))
        .catch(() => setUvrFailed(true));
    }
  }, [hasUvrCredits]);

  // activos registrados (propiedades, vehículos, inversiones…) a su valor de hoy
  const assetsValue = (data.assets || []).reduce((s, a) => s + assetValueAt(a, a.valuations, todayISO()).value, 0);
  const totalAssets = data.accounts.reduce((s, a) => s + accountBalance(data.transactions, a.id), 0)
    + data.goals.reduce((s, g) => s + g.currentAmount, 0) + assetsValue;
  let totalLiabilities = 0, uvrLiabilitiesPending = 0;
  creditsWithPayments.forEach((cp) => {
    const bal = creditOutstandingBalance(cp.credit, cp.payments);
    if (cp.credit.currency === 'UVR') {
      if (uvrRate) totalLiabilities += bal * uvrRate.value;
      else uvrLiabilitiesPending += bal;
    } else {
      totalLiabilities += bal;
    }
  });
  const netWorth = totalAssets - totalLiabilities;

  // división entre lo compartido/familiar (todos lo ven) y lo personal (solo yo)
  function splitFamilyPersonal(list) {
    const family = [], personal = [];
    list.forEach((t) => {
      if (t.type === 'settlement' || t.type === 'transfer') return;
      const account = data.accounts.find((a) => a.id === t.accountId);
      const isFamily = t.isShared || account?.type === 'shared';
      if (isFamily) family.push(t);
      else if (t.memberId === myId) personal.push(t);
    });
    return { family, personal };
  }
  function monthTotals(list) {
    let income = 0, expense = 0;
    list.forEach((t) => {
      const occ = occurrencesInMonth(t, mKey);
      if (!occ) return;
      if (t.type === 'income') income += t.amount * occ; else expense += t.amount * occ;
    });
    return { income, expense, balance: income - expense };
  }
  const { family, personal } = splitFamilyPersonal(data.transactions);
  const familyTotals = monthTotals(family);
  const personalTotals = monthTotals(personal);

  // las transferencias entre integrantes (no ligadas a un objetivo) no son ingreso/gasto,
  // pero sí mueven plata de/hacia mi bolsillo personal — se reflejan aparte, con transparencia
  let personalTransferNet = 0;
  data.transactions.forEach((t) => {
    if (t.type !== 'transfer' || t.goalId) return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    if (t.memberId === myId) personalTransferNet -= t.amount * occ;
    if (t.toMemberId === myId) personalTransferNet += t.amount * occ;
  });
  personalTotals.transferNet = personalTransferNet;
  personalTotals.balance += personalTransferNet;

  let income = 0, expense = 0;
  visibleTransactions.forEach((t) => {
    if (t.type === 'settlement' || t.type === 'transfer') return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    if (t.type === 'income') income += t.amount * occ;
    else expense += t.amount * occ;
  });
  // en vista Individual, las transferencias hacia/desde ese integrante sí deben
  // afectar su balance (en Unificado se excluyen porque entre dos integrantes
  // del mismo hogar el efecto neto es cero para el hogar completo)
  let transferNetForView = 0;
  if (data.viewMode === 'individual' && visibleMemberId) {
    data.transactions.forEach((t) => {
      if (t.type !== 'transfer' || t.goalId) return;
      const occ = occurrencesInMonth(t, mKey);
      if (!occ) return;
      if (t.memberId === visibleMemberId) transferNetForView -= t.amount * occ;
      if (t.toMemberId === visibleMemberId) transferNetForView += t.amount * occ;
    });
  }
  const balance = income - expense + transferNetForView;

  // proyección del mes y cuánto se puede gastar hoy según los presupuestos
  const projection = projectMonth({ transactions: visibleTransactions, categories: data.categories, todayISO: todayISO() });
  const showProjection = projection.incomeSoFar > 0 || projection.fixed > 0 || projection.variableSoFar > 0;
  const allowances = data.budgets.length
    ? budgetAllowances({ transactions: visibleTransactions, budgets: data.budgets, mKey, daysLeft: daysLeftInMonth() })
    : null;

  const byCategory = {};
  visibleTransactions.forEach((t) => {
    if (t.type !== 'expense') return;
    const occ = occurrencesInMonth(t, mKey);
    if (!occ) return;
    byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount * occ;
  });
  const catData = Object.entries(byCategory).map(([id, val]) => {
    const cat = data.categories.find((c) => c.id === id);
    return { name: cat?.name || 'Otro', value: val, icon: cat?.icon };
  }).sort((a, b) => b.value - a.value);
  const pieColors = [T.teal, T.coral, T.gold, '#5B7FA6', '#8E5B9F', '#4A9B6E', '#B5533C'];

  // próximos pagos (14 días) — junta transacciones recurrentes (cuentan solas
  // hacia el presupuesto) y Obligaciones (recordatorio + registro manual,
  // incluidas las de monto variable) en una sola lista, para no mostrar el
  // mismo tipo de aviso en dos lugares separados de la app.
  const upcomingRecurring = data.transactions
    .filter((t) => t.recurring && (data.viewMode === 'unified' || t.memberId === visibleMemberId))
    .map((t) => ({ ...t, next: getNextOccurrence(t) }))
    .filter((t) => daysUntil(t.next) >= 0 && daysUntil(t.next) <= 14)
    .map((t) => ({ kind: 'recurring', id: t.id, next: t.next, amount: t.amount, type: t.type, label: t.description || data.categories.find((c) => c.id === t.categoryId)?.name, icon: data.categories.find((c) => c.id === t.categoryId)?.icon }));
  const upcomingObligations = (data.obligations || [])
    .filter((o) => o.enabled && (data.viewMode === 'unified' || o.ownerMemberId === visibleMemberId || !o.ownerMemberId))
    .filter((o) => daysUntil(o.nextDueDate) >= 0 && daysUntil(o.nextDueDate) <= 14)
    .map((o) => ({ kind: 'obligation', id: o.id, next: o.nextDueDate, amount: o.amount, obligation: o, label: o.name }));
  // fecha límite de pago de cada tarjeta con deuda (las cuentas ya vienen filtradas por privacidad)
  const upcomingCards = data.accounts
    .filter((a) => a.paymentKind === 'tarjeta_credito' && a.paymentDay)
    .map((a) => {
      const used = cardUsage(a, accountBalance(data.transactions, a.id)).used;
      const plans = (data.cardPlans || []).filter((p) => p.accountId === a.id);
      return { account: a, used, next: cardCycle(a, todayISO()).paymentDue, payNow: payToAvoidInterest(used, plans).payNow };
    })
    .filter((c) => c.used > 0 && c.next && daysUntil(c.next) >= 0 && daysUntil(c.next) <= 14)
    .map((c) => ({ kind: 'card', id: `card-${c.account.id}`, next: c.next, amount: c.payNow || c.used, type: 'expense', label: `Pagar tarjeta ${c.account.name}`, account: c.account }));
  const upcoming = [...upcomingRecurring, ...upcomingObligations, ...upcomingCards].sort((a, b) => a.next.localeCompare(b.next));

  function registerObligation(o) {
    setModal({
      type: 'transaction',
      payload: {
        source: 'obligation', type: 'expense', description: o.name,
        amount: o.amount ?? undefined, categoryId: o.categoryId || undefined,
        accountId: o.accountId || undefined, memberId: o.ownerMemberId || undefined,
        date: todayISO(),
      },
    });
  }

  // alertas de presupuesto
  const budgetAlerts = data.budgets.map((b) => {
    const spent = data.transactions
      .filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && occurrencesInMonth(t, mKey) && (b.scope === 'household' || t.memberId === b.scope))
      .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mKey), 0);
    return { ...b, spent, pct: b.limit ? (spent / b.limit) * 100 : 0 };
  }).filter((b) => b.pct >= 80);

  // top objetivo
  const topGoals = [...data.goals].sort((a, b) => goalPriorityScore(b) - goalPriorityScore(a)).slice(0, 2);

  return (
    <div className="pb-4">
      <div style={{ marginTop: 8 }}><PrimerosPasos data={data} householdId={actions.householdId} setModal={setModal} setTab={setTab} /></div>
      <Card style={{ marginTop: 8, marginBottom: 16, background: T.inverse, border: 'none' }}>
        <div className="flex items-center gap-1.5 mb-1"><Landmark size={14} color="#fff" /><span style={{ fontSize: 12, color: '#fff', opacity: 0.7, fontFamily: FONT_BODY, fontWeight: 600 }}>Patrimonio neto</span></div>
        <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 24, color: '#fff' }}>{formatMoney(netWorth, currency)}</p>
        <div className="flex items-center justify-between mt-1.5">
          <span style={{ fontSize: 11, color: '#fff', opacity: 0.7 }}>Activos {formatMoney(totalAssets, currency)}</span>
          <span style={{ fontSize: 11, color: '#fff', opacity: 0.7 }}>Pasivos {formatMoney(totalLiabilities, currency)}</span>
        </div>
        {assetsValue > 0 && <p style={{ fontSize: 10, color: '#fff', opacity: 0.6 }} className="mt-1">Incluye {formatMoney(assetsValue, currency)} en propiedades, vehículos e inversiones</p>}
        {uvrLiabilitiesPending > 0 && (
          <p style={{ fontSize: 10, color: '#fff', opacity: 0.6 }} className="mt-1">
            + {uvrLiabilitiesPending.toLocaleString('es-CO', { maximumFractionDigits: 2 })} UVR en créditos {uvrFailed ? '(no se pudo consultar la tasa)' : '(consultando tasa…)'}
          </p>
        )}
      </Card>

      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2 mb-2">
        Balance del mes — familiar (todos lo ven) y personal (solo tú)
      </p>
      <div className="flex flex-col gap-3 mb-4">
        <Card style={{ background: T.tealSoft, border: 'none' }}>
          <div className="flex items-center gap-1.5 mb-1"><Users size={14} color={T.teal} /><span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 600 }}>Familiar / compartido</span></div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, color: T.inkSoft }}>Ingresos {formatMoney(familyTotals.income, currency)} · Gastos {formatMoney(familyTotals.expense, currency)}</span>
            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 17, color: familyTotals.balance >= 0 ? T.teal : T.danger }}>{formatMoney(familyTotals.balance, currency)}</span>
          </div>
        </Card>
        <Card style={{ background: T.goldSoft, border: 'none' }}>
          <div className="flex items-center gap-1.5 mb-1"><Wallet size={14} color={T.gold} /><span style={{ fontSize: 12, color: T.gold, fontFamily: FONT_BODY, fontWeight: 600 }}>Mis finanzas personales</span></div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, color: T.inkSoft }}>
              Ingresos {formatMoney(personalTotals.income, currency)} · Gastos {formatMoney(personalTotals.expense, currency)}
              {personalTotals.transferNet !== 0 && ` · Transferencias ${personalTotals.transferNet > 0 ? '+' : ''}${formatMoney(personalTotals.transferNet, currency)}`}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 17, color: personalTotals.balance >= 0 ? T.teal : T.danger }}>{formatMoney(personalTotals.balance, currency)}</span>
          </div>
          <p style={{ fontSize: 10, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Solo tú puedes ver este bloque</p>
        </Card>
      </div>

      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Según la vista seleccionada arriba ({data.viewMode === 'unified' ? 'Unificado' : 'Individual'}):</p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card style={{ background: T.tealSoft, border: 'none' }}>
          <div className="flex items-center gap-1.5 mb-1"><TrendingUp size={15} color={T.teal} /><span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY }}>Ingresos del mes</span></div>
          <p style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 20, color: T.ink }}>{formatMoney(income, currency)}</p>
        </Card>
        <Card style={{ background: T.coralSoft, border: 'none' }}>
          <div className="flex items-center gap-1.5 mb-1"><TrendingDown size={15} color={T.coral} /><span style={{ fontSize: 12, color: T.coral, fontFamily: FONT_BODY }}>Gastos del mes</span></div>
          <p style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 20, color: T.ink }}>{formatMoney(expense, currency)}</p>
        </Card>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div className="flex items-center justify-between">
          <span style={{ fontFamily: FONT_BODY, color: T.inkSoft, fontSize: 13 }}>Balance de {data.viewMode === 'unified' ? 'el hogar' : 'este integrante'}</span>
          <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 22, color: balance >= 0 ? T.teal : T.danger }}>{formatMoney(balance, currency)}</span>
        </div>
        {transferNetForView !== 0 && (
          <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Incluye {transferNetForView > 0 ? '+' : ''}{formatMoney(transferNetForView, currency)} de transferencias entre integrantes</p>
        )}
      </Card>

      {showProjection && (
        <Card style={{ marginBottom: 16 }}>
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={16} color={T.ink} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Proyección a fin de mes</span></div>
          <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>A este ritmo terminarás el mes gastando</p>
          <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 20, color: T.ink }}>{formatMoney(projection.projectedExpense, currency)}</p>
          <div className="flex items-center justify-between mt-2">
            <span style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Ingresos registrados este mes</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.ink }}>{formatMoney(projection.incomeSoFar, currency)}</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Te quedarían</span>
            <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 14, color: projection.status === 'over' ? T.danger : projection.status === 'tight' ? T.gold : T.teal }}>{formatMoney(projection.projectedBalance, currency)}</span>
          </div>
          {projection.status === 'over' && <p style={{ fontSize: 12, color: T.danger, fontFamily: FONT_BODY }} className="mt-2">A este ritmo gastarías más de lo que ingresa este mes. Revisa los gastos variables.</p>}
          {projection.status === 'tight' && <p style={{ fontSize: 12, color: T.gold, fontFamily: FONT_BODY }} className="mt-2">Vas ajustado: te quedaría menos del 10% de tus ingresos.</p>}
          <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">
            Fijos y recurrentes {formatMoney(projection.fixed, currency)} · variables ≈ {formatMoney(projection.dailyAverage, currency)} por día.
            {projection.confidence === 'low' ? ' Es muy temprano en el mes: la estimación mejora con los días.' : ' Solo cuenta ingresos y gastos operativos (no préstamos ni pagos a capital).'}
          </p>
          {allowances && (
            <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>Disponible para gastar hoy</span>
                <span style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 15, color: allowances.totalPerDay < 0 ? T.danger : T.teal }}>{formatMoney(allowances.totalPerDay, currency)}</span>
              </div>
              <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-0.5">Lo que queda de tus presupuestos ({formatMoney(allowances.totalRemaining, currency)}) repartido entre los {daysLeftInMonth()} días que faltan, contando hoy.</p>
            </div>
          )}
        </Card>
      )}

      <SaludFinanciera data={data} transactions={visibleTransactions} />

      {budgetAlerts.length > 0 && (
        <Card style={{ marginBottom: 16, background: T.goldSoft, border: 'none' }}>
          <div className="flex items-center gap-2 mb-2"><AlertTriangle size={16} color={T.gold} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Presupuestos por vencer</span></div>
          {budgetAlerts.map((b) => {
            const cat = data.categories.find((c) => c.id === b.categoryId);
            return <p key={b.id} style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-0.5">
              <span className="inline-flex items-center gap-1"><CategoryIcon icon={cat?.icon} size={13} color={T.inkSoft} /> {cat?.name}</span>: usaste {Math.round(b.pct)}% ({formatMoney(b.spent, currency)} de {formatMoney(b.limit, currency)})
            </p>;
          })}
        </Card>
      )}

      <AnomaliasCard data={data} actions={actions} transactions={visibleTransactions} setModal={setModal} />

      {upcoming.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div className="flex items-center gap-2 mb-3"><Calendar size={16} color={T.ink} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Próximos pagos</span></div>
          {upcoming.map((t) => {
            const d = daysUntil(t.next);
            const isObligation = t.kind === 'obligation';
            const isCardPayment = t.kind === 'card';
            const row = (
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <CategoryIcon icon={t.icon} size={16} color={T.inkSoft} />
                  <div>
                    <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>{t.label}</p>
                    <p style={{ fontSize: 11.5, color: T.inkSoft }}>{d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d} días`} · {formatDate(t.next)}</p>
                  </div>
                </div>
                {isObligation
                  ? <span style={{ fontFamily: FONT_MONO, fontSize: 13.5, color: T.inkSoft }}>{t.amount == null ? 'Variable' : formatMoney(t.amount, currency)}</span>
                  : <span style={{ fontFamily: FONT_MONO, fontSize: 13.5, color: t.type === 'income' ? T.teal : T.coral }}>{t.type === 'income' ? '+' : '-'}{formatMoney(t.amount, currency)}</span>}
              </div>
            );
            if (isCardPayment) return <button key={t.id} onClick={() => setModal({ type: 'cardPay', payload: { account: t.account } })} className="w-full text-left active:opacity-70">{row}</button>;
            return isObligation
              ? <button key={t.id} onClick={() => registerObligation(t.obligation)} className="w-full text-left active:opacity-70">{row}</button>
              : <div key={t.id}>{row}</div>;
          })}
        </Card>
      )}

      {catData.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }} className="mb-2">Gastos por categoría</p>
          <div style={{ padding: '4px 0 10px' }}>
            <DonutChart data={catData} colors={pieColors} />
          </div>
          <div className="flex flex-col gap-1 mt-1">
            {catData.slice(0, 5).map((c, i) => (
              <div key={c.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5"><div style={{ width: 8, height: 8, borderRadius: 4, background: pieColors[i % pieColors.length] }} /><span className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: T.inkSoft }}><CategoryIcon icon={c.icon} size={12} color={T.inkSoft} /> {c.name}</span></div>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: T.ink }}>{formatMoney(c.value, currency)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {topGoals.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Sparkles size={16} color={T.gold} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Objetivos prioritarios</span></div>
            <button onClick={() => setTab('objetivos')}><ChevronRight size={18} color={T.inkSoft} /></button>
          </div>
          {topGoals.map((g) => (
            <div key={g.id} className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{g.name}</span>
                <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_MONO }}>{formatMoney(g.currentAmount, currency)} / {formatMoney(g.targetAmount, currency)}</span>
              </div>
              <ProgressBar value={(g.currentAmount / g.targetAmount) * 100} color={T.gold} />
            </div>
          ))}
        </Card>
      )}

      {visibleTransactions.length === 0 && (
        <EmptyState icon={<Wallet size={40} color={T.teal} />} title="Aún no hay movimientos" subtitle="Toca el botón + para registrar tu primer ingreso o gasto." />
      )}
    </div>
  );
}
