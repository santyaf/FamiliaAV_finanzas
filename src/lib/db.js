import { supabase } from './supabaseClient';
import { generateSchedule, recalcAfterExtraPayment } from './amortization';

/* ------------------------- AUTH ------------------------- */
export async function signUp(email, password, fullName) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOut() {
  await supabase.auth.signOut();
}
export async function resetPasswordForEmail(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.location.pathname}`,
  });
  if (error) throw error;
}
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

/* ---------------------- HOGAR / MEMBRESÍA ---------------------- */
export async function getMyHousehold(userId) {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, role, color, households(id, name, currency)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { householdId: data.household_id, role: data.role, color: data.color, household: data.households };
}

export async function createHousehold(userId, name, currency) {
  const { data: household, error: e1 } = await supabase
    .from('households').insert({ name, currency }).select().single();
  if (e1) throw e1;

  const { error: e2 } = await supabase.from('household_members').insert({
    household_id: household.id, user_id: userId, role: 'admin', color: '#2F6E68',
  });
  if (e2) throw e2;

  // categorías por defecto
  const defaults = [
    ['Salario', 'income', '💼'], ['Negocio / Freelance', 'income', '🧾'], ['Rentas', 'income', '🏠'],
    ['Inversiones', 'income', '📈'], ['Otros ingresos', 'income', '➕'],
    ['Vivienda', 'expense', '🏠'], ['Alimentación', 'expense', '🍎'], ['Transporte', 'expense', '🚗'],
    ['Salud', 'expense', '⚕️'], ['Educación', 'expense', '🎓'], ['Ocio y entretenimiento', 'expense', '🎬'],
    ['Ropa', 'expense', '👕'], ['Servicios (luz/agua/internet)', 'expense', '💡'],
    ['Deudas y préstamos', 'expense', '💳'], ['Ahorro / Inversión', 'expense', '🐷'], ['Otros gastos', 'expense', '➖'],
  ];
  await supabase.from('categories').insert(
    defaults.map(([name, type, icon]) => ({ household_id: household.id, name, type, icon }))
  );

  // cuenta compartida inicial
  await supabase.from('accounts').insert({
    household_id: household.id, name: `Cuenta compartida — ${name}`, type: 'shared', owner_ids: [userId],
  });

  return household.id;
}

export async function createInvite(householdId, userId) {
  const { data, error } = await supabase
    .from('household_invites')
    .insert({ household_id: householdId, created_by: userId })
    .select().single();
  if (error) throw error;
  return data;
}

export async function redeemInvite(token, userId) {
  const { data, error } = await supabase.rpc('redeem_invite', { p_token: token });
  if (error) throw new Error(error.message.replace(/^.*: /, ''));
  return data; // household_id
}

/* ---------------------- CARGA DE DATOS DEL HOGAR ---------------------- */
export async function loadHouseholdData(householdId) {
  const [membersRes, catsRes, accsRes, txRes, goalsRes, votesRes, budgetsRes] = await Promise.all([
    supabase.from('household_members').select('user_id, role, color, profiles(full_name)').eq('household_id', householdId),
    supabase.from('categories').select('*').eq('household_id', householdId),
    supabase.from('accounts').select('*').eq('household_id', householdId),
    supabase.from('transactions').select('*').eq('household_id', householdId),
    supabase.from('goals').select('*').eq('household_id', householdId),
    supabase.from('goal_votes').select('*'),
    supabase.from('budgets').select('*').eq('household_id', householdId),
  ]);
  for (const r of [membersRes, catsRes, accsRes, txRes, goalsRes, votesRes, budgetsRes]) {
    if (r.error) throw r.error;
  }

  const members = membersRes.data.map((m) => ({ id: m.user_id, name: m.profiles?.full_name || 'Integrante', color: m.color, role: m.role }));
  const categories = catsRes.data;
  const accounts = accsRes.data.map((a) => ({ id: a.id, name: a.name, type: a.type, ownerIds: a.owner_ids }));
  const transactions = txRes.data.map(dbTxToJs);
  const votesByGoal = {};
  votesRes.data.forEach((v) => { (votesByGoal[v.goal_id] ||= {})[v.member_id] = v.priority; });
  const goals = goalsRes.data.map((g) => ({
    id: g.id, name: g.name, targetAmount: Number(g.target_amount), currentAmount: Number(g.current_amount),
    targetDate: g.target_date, votes: votesByGoal[g.id] || {},
  }));
  const budgets = budgetsRes.data.map((b) => ({ id: b.id, categoryId: b.category_id, limit: Number(b.limit_amount), scope: b.scope }));

  return { members, categories, accounts, transactions, goals, budgets };
}

function dbTxToJs(t) {
  if (t.type === 'settlement') {
    return { id: t.id, type: 'settlement', from: t.settlement_from, to: t.settlement_to, amount: Number(t.amount), date: t.date };
  }
  return {
    id: t.id, type: t.type, description: t.description, amount: Number(t.amount),
    categoryId: t.category_id, accountId: t.account_id, memberId: t.member_id, date: t.date,
    recurring: t.recurring, frequency: t.frequency, isShared: t.is_shared, participants: t.participants,
    version: t.version || 1, editedBy: t.edited_by, editedAt: t.edited_at,
  };
}

/* ---------------------- EDICIÓN CON HISTÓRICO ---------------------- */
export async function updateTransactionWithHistory(userId, original, patch) {
  // 1. guarda una foto del estado anterior antes de sobreescribir
  const snapshot = {
    type: original.type, description: original.description, amount: original.amount,
    category_id: original.categoryId, account_id: original.accountId, member_id: original.memberId,
    date: original.date, recurring: original.recurring, frequency: original.frequency,
    is_shared: original.isShared, participants: original.participants,
  };
  const { error: e1 } = await supabase.from('transaction_history').insert({
    transaction_id: original.id, data: snapshot, edited_by: userId,
  });
  if (e1) throw e1;

  // 2. aplica el cambio y sube la versión
  const row = {
    type: patch.type, description: patch.description, amount: patch.amount,
    category_id: patch.categoryId, account_id: patch.accountId, member_id: patch.memberId,
    date: patch.date, recurring: patch.recurring, frequency: patch.frequency,
    is_shared: patch.isShared, participants: patch.participants,
    edited_by: userId, edited_at: new Date().toISOString(),
    version: (original.version || 1) + 1,
  };
  const { error: e2 } = await supabase.from('transactions').update(row).eq('id', original.id);
  if (e2) throw e2;
}

export async function getTransactionHistory(transactionId) {
  const { data, error } = await supabase
    .from('transaction_history')
    .select('id, data, edited_at, edited_by, profiles(full_name)')
    .eq('transaction_id', transactionId)
    .order('edited_at', { ascending: false });
  if (error) throw error;
  return data.map((h) => ({
    id: h.id,
    editedAt: h.edited_at,
    editorName: h.profiles?.full_name || 'Alguien',
    snapshot: {
      type: h.data.type, description: h.data.description, amount: Number(h.data.amount),
      categoryId: h.data.category_id, accountId: h.data.account_id, memberId: h.data.member_id,
      date: h.data.date, recurring: h.data.recurring, frequency: h.data.frequency,
      isShared: h.data.is_shared, participants: h.data.participants,
    },
  }));
}

/* ---------------------- MUTACIONES ---------------------- */
export async function addTransaction(householdId, userId, t) {
  const row = {
    household_id: householdId, type: t.type, description: t.description, amount: t.amount,
    category_id: t.categoryId, account_id: t.accountId, member_id: t.memberId, date: t.date,
    recurring: t.recurring, frequency: t.frequency, is_shared: t.isShared, participants: t.participants,
    created_by: userId,
  };
  const { error } = await supabase.from('transactions').insert(row);
  if (error) throw error;
}
export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}
export async function addSettlement(householdId, userId, from, to, amount) {
  const { error } = await supabase.from('transactions').insert({
    household_id: householdId, type: 'settlement', amount, date: new Date().toISOString().slice(0, 10),
    settlement_from: from, settlement_to: to, created_by: userId,
  });
  if (error) throw error;
}

export async function addGoal(householdId, goal) {
  const { error } = await supabase.from('goals').insert({
    household_id: householdId, name: goal.name, target_amount: goal.targetAmount,
    current_amount: 0, target_date: goal.targetDate,
  });
  if (error) throw error;
}
export async function removeGoal(id) {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
}
export async function voteGoal(goalId, memberId, priority) {
  const { error } = await supabase.from('goal_votes')
    .upsert({ goal_id: goalId, member_id: memberId, priority }, { onConflict: 'goal_id,member_id' });
  if (error) throw error;
}
export async function contributeGoal(householdId, userId, goal, amount, memberId, accountId, ahorroCategoryId) {
  await addTransaction(householdId, userId, {
    type: 'expense', description: `Aporte a "${goal.name}"`, amount, categoryId: ahorroCategoryId,
    accountId, memberId, date: new Date().toISOString().slice(0, 10), recurring: false, frequency: null,
    isShared: false, participants: null,
  });
  const { error } = await supabase.from('goals').update({ current_amount: goal.currentAmount + amount }).eq('id', goal.id);
  if (error) throw error;
}

export async function addBudget(householdId, budget) {
  const { error } = await supabase.from('budgets').insert({
    household_id: householdId, category_id: budget.categoryId, limit_amount: budget.limit, scope: budget.scope,
  });
  if (error) throw error;
}
export async function removeBudget(id) {
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw error;
}

export async function addAccount(householdId, account) {
  const { error } = await supabase.from('accounts').insert({
    household_id: householdId, name: account.name, type: account.type, owner_ids: account.ownerIds,
  });
  if (error) throw error;
}
export async function removeAccount(id) {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

export async function addCategory(householdId, category) {
  const { error } = await supabase.from('categories').insert({
    household_id: householdId, name: category.name, type: category.type, icon: category.icon,
  });
  if (error) throw error;
}
export async function removeCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function updateHousehold(householdId, patch) {
  const dbPatch = {};
  if (patch.householdName !== undefined) dbPatch.name = patch.householdName;
  if (patch.currency !== undefined) dbPatch.currency = patch.currency;
  const { error } = await supabase.from('households').update(dbPatch).eq('id', householdId);
  if (error) throw error;
}

export async function leaveHousehold(householdId, userId) {
  const { error } = await supabase.from('household_members').delete().eq('household_id', householdId).eq('user_id', userId);
  if (error) throw error;
}

/* ---------------------------------------------------------------------- */
/* CRÉDITOS                                                                */
/* ---------------------------------------------------------------------- */

function dbCreditToJs(c) {
  return {
    id: c.id, name: c.name, creditType: c.credit_type, currency: c.currency,
    principal: Number(c.principal), annualRate: Number(c.annual_rate), termMonths: c.term_months,
    amortizationSystem: c.amortization_system, insuranceMonthly: Number(c.insurance_monthly),
    ownerMemberId: c.owner_member_id, accountId: c.account_id, startDate: c.start_date, status: c.status,
  };
}
function dbPaymentToJs(p) {
  return {
    id: p.id, creditId: p.credit_id, installmentNumber: p.installment_number, dueDate: p.due_date,
    capital: Number(p.capital), interest: Number(p.interest), insurance: Number(p.insurance), total: Number(p.total),
    balanceAfter: Number(p.balance_after), paid: p.paid, paidDate: p.paid_date, transactionId: p.transaction_id,
  };
}

export async function loadCredits(householdId) {
  const { data, error } = await supabase.from('credits').select('*').eq('household_id', householdId).order('created_at');
  if (error) throw error;
  return data.map(dbCreditToJs);
}
export async function loadCreditPayments(creditId) {
  const { data, error } = await supabase.from('credit_payments').select('*').eq('credit_id', creditId).order('installment_number');
  if (error) throw error;
  return data.map(dbPaymentToJs);
}
export async function loadCreditExtraPayments(creditId) {
  const { data, error } = await supabase.from('credit_extra_payments').select('*, profiles(full_name)').eq('credit_id', creditId).order('applied_date', { ascending: false });
  if (error) throw error;
  return data.map((e) => ({ id: e.id, amount: Number(e.amount), strategy: e.strategy, appliedDate: e.applied_date, byName: e.profiles?.full_name || 'Alguien' }));
}

export async function createCredit(householdId, userId, credit) {
  const { data: row, error } = await supabase.from('credits').insert({
    household_id: householdId, name: credit.name, credit_type: credit.creditType, currency: credit.currency,
    principal: credit.principal, annual_rate: credit.annualRate, term_months: credit.termMonths,
    amortization_system: credit.amortizationSystem, insurance_monthly: credit.insuranceMonthly,
    owner_member_id: credit.ownerMemberId || null, account_id: credit.accountId || null,
    start_date: credit.startDate, created_by: userId,
  }).select().single();
  if (error) throw error;

  const schedule = generateSchedule({
    principal: credit.principal, annualRate: credit.annualRate, termMonths: credit.termMonths,
    system: credit.amortizationSystem, insuranceMonthly: credit.insuranceMonthly, startDate: credit.startDate,
  });
  const { error: e2 } = await supabase.from('credit_payments').insert(
    schedule.map((r) => ({
      credit_id: row.id, installment_number: r.installmentNumber, due_date: r.dueDate,
      capital: r.capital, interest: r.interest, insurance: r.insurance, total: r.total, balance_after: r.balanceAfter,
    }))
  );
  if (e2) throw e2;
  return row.id;
}

export async function deleteCredit(id) {
  const { error } = await supabase.from('credits').delete().eq('id', id);
  if (error) throw error;
}

export async function markInstallmentPaid(householdId, userId, credit, installment, accountId, memberId, categoryId) {
  // 1. crea el gasto correspondiente
  const { data: tx, error: e1 } = await supabase.from('transactions').insert({
    household_id: householdId, type: 'expense',
    description: `Cuota ${installment.installmentNumber}/${credit.termMonths} — ${credit.name}`,
    amount: installment.total, category_id: categoryId, account_id: accountId, member_id: memberId,
    date: new Date().toISOString().slice(0, 10), recurring: false, is_shared: !credit.ownerMemberId,
    created_by: userId,
  }).select().single();
  if (e1) throw e1;

  // 2. marca la cuota como pagada y la enlaza con el gasto
  const { error: e2 } = await supabase.from('credit_payments').update({
    paid: true, paid_date: new Date().toISOString().slice(0, 10), transaction_id: tx.id,
  }).eq('id', installment.id);
  if (e2) throw e2;

  // 3. si era la última cuota, marca el crédito como pagado
  const { count } = await supabase.from('credit_payments').select('id', { count: 'exact', head: true })
    .eq('credit_id', credit.id).eq('paid', false);
  if (count === 0) {
    await supabase.from('credits').update({ status: 'pagado' }).eq('id', credit.id);
  }
}

export async function applyExtraPayment(householdId, userId, credit, payments, extraAmount, strategy, applyDate, accountId, memberId, categoryId, registerAsExpense) {
  const unpaid = payments.filter((p) => !p.paid).sort((a, b) => a.installmentNumber - b.installmentNumber);
  if (!unpaid.length) throw new Error('Este crédito ya no tiene cuotas pendientes.');
  const paidRows = payments.filter((p) => p.paid);
  const currentBalance = paidRows.length ? paidRows[paidRows.length - 1].balanceAfter : credit.principal;
  const remainingMonths = unpaid.length;
  const nextInstallmentNumber = unpaid[0].installmentNumber;

  const newRows = recalcAfterExtraPayment({
    currentBalance, extraAmount, strategy, annualRate: credit.annualRate, system: credit.amortizationSystem,
    remainingMonths, insuranceMonthly: credit.insuranceMonthly, fromDate: applyDate, nextInstallmentNumber,
  });

  // borra las cuotas futuras no pagadas y crea las nuevas recalculadas
  const { error: eDel } = await supabase.from('credit_payments').delete().eq('credit_id', credit.id).eq('paid', false);
  if (eDel) throw eDel;

  if (newRows.length) {
    const { error: eIns } = await supabase.from('credit_payments').insert(
      newRows.map((r) => ({
        credit_id: credit.id, installment_number: r.installmentNumber, due_date: r.dueDate,
        capital: r.capital, interest: r.interest, insurance: r.insurance, total: r.total, balance_after: r.balanceAfter,
      }))
    );
    if (eIns) throw eIns;
  } else {
    await supabase.from('credits').update({ status: 'pagado' }).eq('id', credit.id);
  }

  await supabase.from('credit_extra_payments').insert({
    credit_id: credit.id, amount: extraAmount, strategy, applied_date: applyDate, created_by: userId,
  });

  if (registerAsExpense) {
    await supabase.from('transactions').insert({
      household_id: householdId, type: 'expense', description: `Abono a capital — ${credit.name}`,
      amount: extraAmount, category_id: categoryId, account_id: accountId, member_id: memberId,
      date: applyDate, recurring: false, is_shared: !credit.ownerMemberId, created_by: userId,
    });
  }
}

/* ---------------------- UVR ---------------------- */
export async function getLatestUvr() {
  try {
    const res = await fetch('/api/uvr');
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    await supabase.from('uvr_rates').upsert({ date: json.date, value: json.value });
    return { date: json.date, value: json.value, cached: false };
  } catch (e) {
    const { data } = await supabase.from('uvr_rates').select('*').order('date', { ascending: false }).limit(1).maybeSingle();
    if (data) return { date: data.date, value: Number(data.value), cached: true };
    return null;
  }
}
export async function saveManualUvr(date, value) {
  const { error } = await supabase.from('uvr_rates').upsert({ date, value });
  if (error) throw error;
}

/* ---------------------------------------------------------------------- */
/* SUPERUSUARIO Y CONFIGURACIÓN GLOBAL                                    */
/* ---------------------------------------------------------------------- */
export async function amIPlatformAdmin(userId) {
  const { data, error } = await supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function getSettings() {
  const { data, error } = await supabase.from('app_settings').select('*');
  if (error) throw error;
  const obj = {};
  data.forEach((row) => { obj[row.key] = row.value; });
  return obj;
}

export async function updateSetting(key, value, userId) {
  const { error } = await supabase.from('app_settings')
    .upsert({ key, value, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function listAllHouseholdsAdmin() {
  const { data, error } = await supabase.from('households')
    .select('id, name, currency, created_at, household_members(user_id)');
  if (error) throw error;
  return data
    .map((h) => ({ id: h.id, name: h.name, currency: h.currency, createdAt: h.created_at, memberCount: h.household_members?.length || 0 }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listPlatformAdmins() {
  const { data, error } = await supabase.from('platform_admins')
    .select('user_id, created_at, profiles(full_name)')
    .order('created_at');
  if (error) throw error;
  return data.map((a) => ({ userId: a.user_id, name: a.profiles?.full_name || 'Usuario', createdAt: a.created_at }));
}

export async function promoteToAdmin(email) {
  const { error } = await supabase.rpc('admin_promote_by_email', { p_email: email });
  if (error) throw new Error(error.message.replace(/^.*: /, ''));
}

export async function removeAdmin(userId) {
  const { error } = await supabase.from('platform_admins').delete().eq('user_id', userId);
  if (error) throw error;
}

/* ---------------------------------------------------------------------- */
/* NOTIFICACIONES                                                          */
/* ---------------------------------------------------------------------- */
export async function loadNotifications(householdId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data.map((n) => ({
    id: n.id, type: n.type, title: n.title, body: n.body, data: n.data,
    read: n.read, createdAt: n.created_at, userId: n.user_id,
  }));
}

export async function markNotificationRead(id) {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(householdId, userId) {
  const { error } = await supabase.from('notifications')
    .update({ read: true })
    .eq('household_id', householdId)
    .or(`user_id.is.null,user_id.eq.${userId}`);
  if (error) throw error;
}

export async function deleteNotification(id) {
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw error;
}

// Inserta nuevas alertas detectadas, ignorando silenciosamente las que ya existen
// (dedupe_key evita que la misma alerta se repita cada vez que alguien abre la app)
export async function upsertNotifications(householdId, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('notifications').upsert(
    rows.map((r) => ({
      household_id: householdId, user_id: r.userId || null, type: r.type,
      title: r.title, body: r.body, data: r.data || null, dedupe_key: r.dedupeKey,
    })),
    { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true }
  );
  if (error) throw error;
}
