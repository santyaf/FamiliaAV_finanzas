import { supabase } from './supabaseClient';

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
    .from('households').insert({ name, currency, created_by: userId }).select().single();
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
  };
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
