// Motor de detección de alertas — corre en el cliente una vez por sesión.
// Extraído de App.jsx (Fase 11) para poder probarlo aislado (ver
// notifications.test.js). Función pura: dado el estado, devuelve la lista de
// notificaciones candidatas (el guardado / dedupe se hace fuera).

import { formatMoney, formatDate } from './format';
import { thisMonthKey, todayISO, monthKey, daysUntil, occurrencesInMonth, goalPriorityScore } from './finance';

export function buildNotificationCandidates(data, creditsWithPayments, myUserId) {
  const out = [];
  const mKey = thisMonthKey();
  const today = new Date(todayISO() + 'T00:00:00');
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysElapsed = today.getDate();
  const monthProgress = daysElapsed / daysInMonth;

  // 1) Proyección temprana de presupuesto: si al ritmo actual vas a terminar por encima del límite
  if (monthProgress > 0.15 && monthProgress < 0.95) {
    data.budgets.forEach((b) => {
      const spent = data.transactions
        .filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && occurrencesInMonth(t, mKey) && (b.scope === 'household' || t.memberId === b.scope))
        .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mKey), 0);
      const projected = spent / monthProgress;
      const pctNow = (spent / b.limit) * 100;
      const pctProjected = (projected / b.limit) * 100;
      if (pctProjected >= 100 && pctNow < 100) {
        const cat = data.categories.find((c) => c.id === b.categoryId);
        out.push({
          type: 'budget_projection',
          title: `Vas a exceder "${cat?.name || 'un presupuesto'}" este mes`,
          body: `Llevas ${Math.round(pctNow)}% del presupuesto con ${Math.round(monthProgress * 100)}% del mes transcurrido. Al ritmo actual, terminarías cerca del ${Math.round(pctProjected)}%.`,
          data: { budgetId: b.id },
          dedupeKey: `budget:${b.id}:${mKey}`,
          userId: b.scope === 'household' ? null : b.scope,
        });
      }
    });
  }

  // 2) Ritmo de objetivos: meta próxima (30 días) y con avance insuficiente
  data.goals.forEach((g) => {
    if (!g.targetDate) return;
    const daysLeft = daysUntil(g.targetDate);
    const pct = g.targetAmount ? (g.currentAmount / g.targetAmount) * 100 : 100;
    if (daysLeft >= 0 && daysLeft <= 30 && pct < 90) {
      out.push({
        type: 'goal_pace',
        title: `"${g.name}" se acerca y va al ${Math.round(pct)}%`,
        body: `Faltan ${daysLeft} día(s) para la fecha meta y llevas ${formatMoney(g.currentAmount, data.currency)} de ${formatMoney(g.targetAmount, data.currency)}.`,
        data: { goalId: g.id },
        dedupeKey: `goal:${g.id}:${mKey}`,
        userId: null,
      });
    }
  });

  // 3) Ingreso extraordinario: un ingreso bastante mayor al promedio histórico de sus ingresos
  const incomeTx = data.transactions.filter((t) => t.type === 'income');
  const avgIncome = incomeTx.length ? incomeTx.reduce((s, t) => s + t.amount, 0) / incomeTx.length : 0;
  if (avgIncome > 0) {
    incomeTx.filter((t) => monthKey(t.date) === mKey && t.amount >= avgIncome * 2).forEach((t) => {
      const topGoal = [...data.goals].sort((a, b) => goalPriorityScore(b) - goalPriorityScore(a))[0];
      out.push({
        type: 'extra_income',
        title: 'Recibiste un ingreso fuera de lo común',
        body: `${formatMoney(t.amount, data.currency)} es bastante más que tu ingreso promedio (${formatMoney(avgIncome, data.currency)}).${topGoal ? ` ¿Destinar parte a "${topGoal.name}" o a un abono a capital?` : ''}`,
        data: { transactionId: t.id },
        dedupeKey: `income:${t.id}`,
        userId: t.memberId,
      });
    });
  }

  // 4) Cuotas de crédito por vencer en los próximos 7 días
  creditsWithPayments.forEach(({ credit, payments }) => {
    const next = payments.find((p) => !p.paid);
    if (!next) return;
    const d = daysUntil(next.dueDate);
    if (d >= 0 && d <= 7) {
      out.push({
        type: 'credit_due',
        title: `Cuota de "${credit.name}" vence pronto`,
        body: `La cuota ${next.installmentNumber} vence ${d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`} (${formatDate(next.dueDate)}) por ${credit.currency === 'UVR' ? `${next.total.toLocaleString('es-CO', { maximumFractionDigits: 2 })} UVR` : formatMoney(next.total, data.currency)}.`,
        data: { creditId: credit.id, paymentId: next.id },
        dedupeKey: `credit_due:${next.id}`,
        userId: credit.ownerMemberId || null,
      });
    }
  });

  // 5) Excedente del mes (familiar) — con más de la mitad del mes ya transcurrida, para que el dato sea confiable
  if (monthProgress > 0.5) {
    let famIncome = 0, famExpense = 0;
    data.transactions.forEach((t) => {
      if (t.type === 'settlement' || t.type === 'transfer') return;
      const account = data.accounts.find((a) => a.id === t.accountId);
      const isFamily = t.isShared || account?.type === 'shared';
      if (!isFamily) return;
      const occ = occurrencesInMonth(t, mKey);
      if (!occ) return;
      if (t.type === 'income') famIncome += t.amount * occ; else famExpense += t.amount * occ;
    });
    const surplus = famIncome - famExpense;
    if (famIncome > 0 && surplus > famIncome * 0.25) {
      const topGoal = [...data.goals].sort((a, b) => goalPriorityScore(b) - goalPriorityScore(a))[0];
      out.push({
        type: 'surplus_opportunity',
        title: 'Este mes va bien: hay excedente familiar',
        body: `Llevan ${formatMoney(surplus, data.currency)} de excedente este mes.${topGoal ? ` Podría acelerar "${topGoal.name}" o un abono a capital.` : ' Es buen momento para reforzar un objetivo o un abono a capital.'}`,
        data: {},
        dedupeKey: `surplus:${mKey}`,
        userId: null,
      });
    }
  }

  return out;
}
