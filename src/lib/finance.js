// Funciones puras de cálculo financiero, extraídas de App.jsx para poder
// probarlas de forma aislada (Fase 11). No dependen de React ni del DOM.

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const monthKey = (d) => (d || todayISO()).slice(0, 7);
export const thisMonthKey = () => monthKey(todayISO());

export function daysUntil(d) {
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(d + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

export function getNextOccurrence(t) {
  const today = new Date(todayISO() + 'T00:00:00');
  let d = new Date(t.date + 'T00:00:00');
  if (t.frequency === 'semanal') {
    while (d < today) d.setDate(d.getDate() + 7);
  } else if (t.frequency === 'quincenal') {
    while (d < today) d.setDate(d.getDate() + 14);
  } else if (t.frequency === 'anual') {
    while (d < today) d.setFullYear(d.getFullYear() + 1);
  } else {
    // mensual
    while (d < today) d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export function occurrencesInMonth(t, mKey) {
  // cuántas veces cae una transacción recurrente en el mes dado
  if (!t.recurring) return t.date && monthKey(t.date) === mKey ? 1 : 0;
  const [y, m] = mKey.split('-').map(Number);
  const start = new Date(t.date + 'T00:00:00');
  if (t.frequency === 'anual') {
    return start.getMonth() + 1 === m ? 1 : 0;
  }
  if (start > new Date(y, m, 0)) return 0; // aún no inicia ese mes
  if (t.frequency === 'mensual') return 1;
  if (t.frequency === 'quincenal') return 2;
  if (t.frequency === 'semanal') return 4;
  return 1;
}

// Reparto "proporcional a ingresos": usa el promedio de ingresos de cada
// integrante en los últimos 3 meses. Si nadie tiene ingresos registrados,
// cae de vuelta a partes iguales.
export function computeIncomeShares(transactions, memberIds) {
  const cutoff = new Date(todayISO() + 'T00:00:00');
  cutoff.setMonth(cutoff.getMonth() - 3);
  const totals = {};
  memberIds.forEach((id) => { totals[id] = 0; });
  transactions.forEach((t) => {
    if (t.type !== 'income' || !memberIds.includes(t.memberId)) return;
    if (new Date(t.date + 'T00:00:00') < cutoff) return;
    totals[t.memberId] += t.amount;
  });
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const eq = 100 / memberIds.length;
    return Object.fromEntries(memberIds.map((id) => [id, eq]));
  }
  return Object.fromEntries(memberIds.map((id) => [id, (totals[id] / sum) * 100]));
}

export function computeBalances(transactions, members) {
  const bal = {};
  members.forEach((m) => (bal[m.id] = 0));
  transactions.forEach((t) => {
    if (t.type === 'settlement') {
      bal[t.from] = (bal[t.from] || 0) + t.amount;
      bal[t.to] = (bal[t.to] || 0) - t.amount;
      return;
    }
    // una transferencia entre integrantes (no ligada a un objetivo) también
    // cuenta como un pago entre ellos, igual que marcar una conciliación como pagada
    if (t.type === 'transfer' && !t.goalId && t.toMemberId && t.settlesDebt) {
      bal[t.memberId] = (bal[t.memberId] || 0) + t.amount;
      bal[t.toMemberId] = (bal[t.toMemberId] || 0) - t.amount;
      return;
    }
    if (t.type === 'expense' && t.isShared && t.participants?.length) {
      const payerShare = t.participants.find((p) => p.memberId === t.memberId)?.share || 0;
      bal[t.memberId] = (bal[t.memberId] || 0) + (t.amount - payerShare);
      t.participants.forEach((p) => {
        if (p.memberId !== t.memberId) bal[p.memberId] = (bal[p.memberId] || 0) - p.share;
      });
    }
  });
  return bal;
}

export function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  Object.entries(balances).forEach(([id, v]) => {
    if (v > 0.5) creditors.push({ id, v });
    else if (v < -0.5) debtors.push({ id, v: -v });
  });
  creditors.sort((a, b) => b.v - a.v);
  debtors.sort((a, b) => b.v - a.v);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].v, creditors[j].v);
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(amt * 100) / 100 });
    debtors[i].v -= amt;
    creditors[j].v -= amt;
    if (debtors[i].v < 0.5) i++;
    if (creditors[j].v < 0.5) j++;
  }
  return transfers;
}

export function goalPriorityScore(goal) {
  const votes = Object.values(goal.votes || {});
  if (!votes.length) return 2;
  return votes.reduce((a, b) => a + b, 0) / votes.length;
}
