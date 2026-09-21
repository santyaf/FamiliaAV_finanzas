import { supabase } from './supabaseClient';
import { generateSchedule, recalcAfterExtraPayment, buildRefinance } from './amortization';
import { DEFAULT_CATEGORY_SPECS, INTEREST_CATEGORY, LOAN_INCOME_CATEGORY, DEBT_CATEGORY, ASSET_PURCHASE_CATEGORY, ASSET_SALE_CATEGORY } from './accounting';
import { creditOutstandingBalance } from './finance';
import { installmentInCop, dueLibranzaInstallments, nextDateWithDay } from './creditRules';
import { duePlanInstallments, planOverview, buildRedefer } from './creditCards';
import { attachmentPath, countByTransaction } from './attachments';

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
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) throw error;
}
// Qué proveedores externos (Google, etc.) están habilitados en el proyecto de
// Supabase. Devuelve null si no se pudo consultar (en ese caso la pantalla de
// login muestra todo, como antes, en vez de esconder un botón que sí funciona).
export async function getEnabledAuthProviders() {
  try {
    const res = await fetch(`${supabase.supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabase.supabaseKey } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.external || null;
  } catch {
    return null;
  }
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
// Todos los hogares de la persona, del más antiguo al más nuevo.
export async function getMyHouseholds(userId) {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id, role, color, joined_at, households(id, name, currency, spend_approval_threshold)')
    .eq('user_id', userId)
    .order('joined_at');
  if (error) throw error;
  return (data || []).map((m) => ({ householdId: m.household_id, role: m.role, color: m.color, household: m.households }));
}

export async function createHousehold(userId, name, currency) {
  const { data: household, error: e1 } = await supabase
    .from('households').insert({ name, currency }).select().single();
  if (e1) throw e1;

  const { error: e2 } = await supabase.from('household_members').insert({
    household_id: household.id, user_id: userId, role: 'admin', color: '#2F6E68',
  });
  if (e2) throw e2;

  // categorías por defecto (con rubro y naturaleza contable)
  await supabase.from('categories').insert(
    DEFAULT_CATEGORY_SPECS.map((c) => ({
      household_id: household.id, name: c.name, type: c.type, icon: c.icon,
      group_name: c.group, nature: c.nature, is_fixed: c.fixed, tax_tag: c.tax || null,
    }))
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
  const [membersRes, catsRes, accsRes, txRes, goalsRes, votesRes, budgetsRes, obligationsRes, plansRes, attRes, assetsRes, valsRes, tplRes, reqRes, reqVotesRes] = await Promise.all([
    supabase.from('household_members').select('user_id, role, color, profiles(full_name)').eq('household_id', householdId),
    supabase.from('categories').select('*').eq('household_id', householdId),
    supabase.from('accounts').select('*').eq('household_id', householdId),
    supabase.from('transactions').select('*').eq('household_id', householdId),
    supabase.from('goals').select('*').eq('household_id', householdId),
    supabase.from('goal_votes').select('*'),
    supabase.from('budgets').select('*').eq('household_id', householdId),
    supabase.from('obligations').select('*').eq('household_id', householdId),
    supabase.from('card_plans').select('*').eq('household_id', householdId),
    supabase.from('transaction_attachments').select('transaction_id').eq('household_id', householdId),
    supabase.from('assets').select('*').eq('household_id', householdId),
    supabase.from('asset_valuations').select('*'),
    supabase.from('transaction_templates').select('*').eq('household_id', householdId),
    supabase.from('spend_requests').select('*').eq('household_id', householdId),
    supabase.from('spend_request_votes').select('*'),
  ]);
  for (const r of [membersRes, catsRes, accsRes, txRes, goalsRes, votesRes, budgetsRes, obligationsRes]) {
    if (r.error) throw r.error;
  }

  const members = membersRes.data.map((m) => ({ id: m.user_id, name: m.profiles?.full_name || 'Integrante', color: m.color, role: m.role }));
  const categories = catsRes.data.map((c) => ({ ...c, groupName: c.group_name || null, isFixed: !!c.is_fixed, nature: c.nature || 'operativo', taxTag: c.tax_tag || null }));
  const accounts = accsRes.data.map((a) => ({
    id: a.id, name: a.name, type: a.type, ownerIds: a.owner_ids, paymentKind: a.payment_kind || 'otro',
    creditLimit: a.credit_limit === null || a.credit_limit === undefined ? null : Number(a.credit_limit),
    statementDay: a.statement_day || null, paymentDay: a.payment_day || null,
    cardRate: a.card_rate === null || a.card_rate === undefined ? null : Number(a.card_rate),
  }));
  // si la tabla de planes fallara, la app sigue funcionando sin las compras diferidas
  const cardPlans = plansRes.error ? [] : plansRes.data.map(dbPlanToJs);
  // cuántos recibos tiene cada movimiento (si falla, la app sigue sin el clip)
  const attachmentCounts = attRes.error ? {} : countByTransaction(attRes.data.map((r) => ({ transactionId: r.transaction_id })));
  const transactions = txRes.data.map(dbTxToJs);
  const votesByGoal = {};
  votesRes.data.forEach((v) => { (votesByGoal[v.goal_id] ||= {})[v.member_id] = v.priority; });
  const goals = goalsRes.data.map((g) => ({
    id: g.id, name: g.name, targetAmount: Number(g.target_amount), currentAmount: Number(g.current_amount),
    targetDate: g.target_date, votes: votesByGoal[g.id] || {}, ownerMemberId: g.owner_member_id,
  }));
  const budgets = budgetsRes.data.map((b) => ({ id: b.id, categoryId: b.category_id, limit: Number(b.limit_amount), scope: b.scope }));
  const obligations = obligationsRes.data.map((o) => ({
    id: o.id, ownerMemberId: o.owner_member_id, name: o.name,
    amount: o.amount === null ? null : Number(o.amount),
    categoryId: o.category_id, accountId: o.account_id, frequency: o.frequency,
    nextDueDate: o.next_due_date, timeOfDay: o.time_of_day, timezone: o.timezone,
    note: o.note, enabled: o.enabled,
  }));

  // activos y sus valoraciones (si falla, la app sigue sin ellos)
  const valsByAsset = {};
  (valsRes.error ? [] : valsRes.data).forEach((v) => { (valsByAsset[v.asset_id] ||= []).push({ id: v.id, date: v.valued_on, value: Number(v.value), note: v.note, createdAt: v.created_at }); });
  const assets = assetsRes.error ? [] : assetsRes.data.map((a) => dbAssetToJs(a, valsByAsset[a.id] || []));

  const templates = tplRes.error ? [] : tplRes.data.map((t) => ({
    id: t.id, name: t.name, type: t.type, description: t.description, amount: t.amount === null ? null : Number(t.amount),
    categoryId: t.category_id, accountId: t.account_id, householdWide: t.household_wide, createdBy: t.created_by,
  }));

  // solicitudes de gasto (si fallan, la app sigue sin ellas)
  const spendRequests = reqRes.error ? [] : reqRes.data.map((r) => ({
    id: r.id, requestedBy: r.requested_by, title: r.title, amount: Number(r.amount), categoryId: r.category_id, accountId: r.account_id,
    note: r.note, status: r.status, transactionId: r.transaction_id, decidedAt: r.decided_at, createdAt: r.created_at,
  }));
  const requestIds = new Set(spendRequests.map((r) => r.id));
  const spendVotes = reqVotesRes.error ? [] : reqVotesRes.data.filter((v) => requestIds.has(v.request_id))
    .map((v) => ({ requestId: v.request_id, memberId: v.member_id, vote: v.vote, comment: v.comment, createdAt: v.created_at }));

  return { members, categories, accounts, transactions, goals, budgets, obligations, cardPlans, attachmentCounts, assets, templates, spendRequests, spendVotes };
}

function dbAssetToJs(a, valuations) {
  return {
    id: a.id, householdId: a.household_id, ownerMemberId: a.owner_member_id, name: a.name, kind: a.kind,
    acquiredOn: a.acquired_on, acquisitionCost: Number(a.acquisition_cost || 0), creditId: a.credit_id,
    annualReturnRate: a.annual_return_rate === null || a.annual_return_rate === undefined ? null : Number(a.annual_return_rate),
    maturityDate: a.maturity_date, institution: a.institution, notes: a.notes, status: a.status,
    soldOn: a.sold_on, soldAmount: a.sold_amount === null || a.sold_amount === undefined ? null : Number(a.sold_amount),
    valuations: valuations.sort((x, y) => x.date.localeCompare(y.date)),
  };
}

function dbPlanToJs(p) {
  return {
    id: p.id, householdId: p.household_id, accountId: p.account_id, transactionId: p.transaction_id, memberId: p.member_id,
    description: p.description, principal: Number(p.principal), annualRate: Number(p.annual_rate), installments: p.installments,
    firstBillDate: p.first_bill_date, billedCount: p.billed_count, status: p.status, createdBy: p.created_by,
  };
}

function dbTxToJs(t) {
  if (t.type === 'settlement') {
    return { id: t.id, type: 'settlement', from: t.settlement_from, to: t.settlement_to, amount: Number(t.amount), date: t.date };
  }
  if (t.type === 'transfer') {
    return {
      id: t.id, type: 'transfer', description: t.description, amount: Number(t.amount),
      accountId: t.account_id, memberId: t.member_id, date: t.date,
      goalId: t.goal_id, transferDirection: t.transfer_direction,
      toMemberId: t.to_member_id, toAccountId: t.to_account_id, settlesDebt: t.settles_debt,
    };
  }
  return {
    id: t.id, type: t.type, description: t.description, amount: Number(t.amount),
    categoryId: t.category_id, accountId: t.account_id, memberId: t.member_id, date: t.date,
    recurring: t.recurring, frequency: t.frequency, isShared: t.is_shared, participants: t.participants,
    nature: t.nature || null,
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
    nature: original.nature || null,
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
    nature: patch.nature || null,
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
  // t.id (opcional): id generado en el cliente — lo usa la cola offline para
  // que reintentar un envío nunca duplique el movimiento (ver offlineQueue.js).
  const row = {
    ...(t.id ? { id: t.id } : {}),
    household_id: householdId, type: t.type, description: t.description, amount: t.amount,
    category_id: t.categoryId, account_id: t.accountId, member_id: t.memberId, date: t.date,
    recurring: t.recurring, frequency: t.frequency, is_shared: t.isShared, participants: t.participants,
    nature: t.nature || null, created_by: userId,
  };
  const { error } = await supabase.from('transactions').insert(row);
  // con un plan de cuotas, un 23505 (el movimiento ya estaba guardado) no corta: falta crear el plan
  if (error && !(t.cardPlan && error.code === '23505')) throw error;
  if (t.cardPlan) await createCardPlan(householdId, userId, t, row.id);
}
// Importación de un extracto: inserta en tandas de 100. Si una tanda falla, avisa cuántos ya quedaron
// guardados (importar de nuevo los marcaría como duplicados, así que reintentar es seguro).
export async function importTransactions(householdId, userId, { accountId, memberId, rows }) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => ({
      household_id: householdId, type: r.type, description: r.description || 'Movimiento importado', amount: r.amount,
      category_id: r.categoryId, account_id: accountId, member_id: memberId || userId, date: r.date,
      recurring: false, is_shared: false, created_by: userId,
    }));
    const { error } = await supabase.from('transactions').insert(chunk);
    if (error) {
      throw new Error(inserted > 0
        ? `Se importaron ${inserted} de ${rows.length} movimientos antes del error (${error.message}). Vuelve a importar el mismo extracto: los ya guardados se marcarán como duplicados.`
        : error.message);
    }
    inserted += chunk.length;
  }
  return inserted;
}
export async function deleteTransaction(id) {
  // los archivos de los recibos no se borran solos con el movimiento: se quitan antes (mejor esfuerzo)
  try {
    const { data: atts } = await supabase.from('transaction_attachments').select('path').eq('transaction_id', id);
    if (atts?.length) await supabase.storage.from('receipts').remove(atts.map((a) => a.path));
  } catch { /* si falla, queda un archivo huérfano pero el movimiento sí se borra */ }
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------------- REUNIÓN MENSUAL ---------------------- */
export async function loadMonthlyReview(householdId, monthKey) {
  const { data, error } = await supabase.from('monthly_reviews').select('decisions')
    .eq('household_id', householdId).eq('month_key', monthKey).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.decisions) ? data.decisions : [];
}
export async function saveMonthlyDecisions(householdId, userId, monthKey, decisions) {
  const { error } = await supabase.from('monthly_reviews').upsert(
    { household_id: householdId, month_key: monthKey, decisions, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: 'household_id,month_key' },
  );
  if (error) throw error;
}

/* ---------------------- PLANTILLAS DE MOVIMIENTOS ---------------------- */
export async function addTemplate(householdId, userId, t) {
  const { error } = await supabase.from('transaction_templates').insert({
    household_id: householdId, created_by: userId, household_wide: !!t.householdWide, name: t.name, type: t.type,
    description: t.description || null, amount: t.amount > 0 ? t.amount : null,
    category_id: t.categoryId || null, account_id: t.accountId || null,
  });
  if (error) throw error;
}
export async function deleteTemplate(id) {
  const { error } = await supabase.from('transaction_templates').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------------- ACTIVOS E INVERSIONES ---------------------- */
const assetRow = (a) => ({
  owner_member_id: a.ownerMemberId || null, name: a.name, kind: a.kind, acquired_on: a.acquiredOn || null,
  acquisition_cost: a.acquisitionCost || 0, credit_id: a.creditId || null,
  annual_return_rate: a.annualReturnRate === '' || a.annualReturnRate === null || a.annualReturnRate === undefined ? null : Number(a.annualReturnRate),
  maturity_date: a.maturityDate || null, institution: a.institution || null, notes: a.notes || null,
});

// Crea el activo con su valoración inicial (el costo) y, si se pagó desde una cuenta de la app, el
// gasto de inversión correspondiente (no es un gasto operativo: cambia efectivo por un activo).
export async function createAsset(householdId, userId, a) {
  const { data: row, error } = await supabase.from('assets').insert({ household_id: householdId, ...assetRow(a) }).select().single();
  if (error) throw error;
  const today = new Date().toISOString().slice(0, 10);
  const vals = [];
  const startDate = a.acquiredOn || today;
  const startValue = a.acquisitionCost > 0 ? a.acquisitionCost : (a.currentValue || 0);
  if (startValue > 0) vals.push({ asset_id: row.id, valued_on: startDate, value: startValue, note: 'Valor inicial' });
  if (a.currentValue > 0 && a.currentValue !== startValue) vals.push({ asset_id: row.id, valued_on: today, value: a.currentValue, note: 'Valor actual al registrar' });
  if (vals.length) {
    const { error: eV } = await supabase.from('asset_valuations').insert(vals);
    if (eV) throw eV;
  }
  if (a.payFromAccountId && a.acquisitionCost > 0) {
    const categoryId = await ensureCategory(householdId, ASSET_PURCHASE_CATEGORY);
    const { error: eTx } = await supabase.from('transactions').insert({
      household_id: householdId, type: 'expense', description: `Compra: ${a.name}`, amount: a.acquisitionCost,
      category_id: categoryId, account_id: a.payFromAccountId, member_id: a.payMemberId || userId,
      date: startDate, recurring: false, is_shared: false, nature: 'inversion', created_by: userId,
    });
    if (eTx) throw eTx;
  }
  return row.id;
}

export async function updateAsset(id, a) {
  const { error } = await supabase.from('assets').update(assetRow(a)).eq('id', id);
  if (error) throw error;
}

export async function addAssetValuation(assetId, { date, value, note }) {
  const { error } = await supabase.from('asset_valuations').insert({ asset_id: assetId, valued_on: date, value, note: note || null });
  if (error) throw error;
}
export async function deleteAssetValuation(id) {
  const { error } = await supabase.from('asset_valuations').delete().eq('id', id);
  if (error) throw error;
}

// Vender: el activo queda "vendido" (vale 0 desde esa fecha) y, si el dinero entró a una cuenta de la
// app, se registra como ingreso de inversión (no es ingreso operativo: la ganancia se ve como valorización).
export async function sellAsset(householdId, userId, asset, { date, amount, accountId, memberId }) {
  const { error } = await supabase.from('assets').update({ status: 'vendido', sold_on: date, sold_amount: amount }).eq('id', asset.id);
  if (error) throw error;
  if (accountId && amount > 0) {
    const categoryId = await ensureCategory(householdId, ASSET_SALE_CATEGORY);
    const { error: eTx } = await supabase.from('transactions').insert({
      household_id: householdId, type: 'income', description: `Venta: ${asset.name}`, amount,
      category_id: categoryId, account_id: accountId, member_id: memberId || userId,
      date, recurring: false, is_shared: false, nature: 'inversion', created_by: userId,
    });
    if (eTx) {
      await supabase.from('assets').update({ status: 'activo', sold_on: null, sold_amount: null }).eq('id', asset.id);
      throw eTx;
    }
  }
}

export async function deleteAsset(id) {
  const { error } = await supabase.from('assets').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------------- RECIBOS ADJUNTOS ---------------------- */
export async function loadAttachments(transactionId) {
  const { data, error } = await supabase.from('transaction_attachments').select('*')
    .eq('transaction_id', transactionId).order('created_at');
  if (error) throw error;
  return data.map((a) => ({ id: a.id, path: a.path, mime: a.mime, sizeBytes: a.size_bytes, fileName: a.file_name, createdAt: a.created_at }));
}

// Sube el archivo al bucket privado y registra su fila; si la fila falla, deshace la subida.
export async function uploadAttachment(householdId, transactionId, file) {
  const path = attachmentPath(householdId, transactionId, file.type, globalThis.crypto.randomUUID());
  const { error: eUp } = await supabase.storage.from('receipts').upload(path, file, { contentType: file.type, upsert: false });
  if (eUp) throw new Error(eUp.message || 'No se pudo subir el archivo');
  const { error } = await supabase.from('transaction_attachments').insert({
    household_id: householdId, transaction_id: transactionId, path, mime: file.type, size_bytes: file.size, file_name: file.name || null,
  });
  if (error) {
    await supabase.storage.from('receipts').remove([path]);
    throw error;
  }
}

// URL temporal (1 h): el bucket es privado.
export async function getAttachmentUrl(path) {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// Primero el archivo (su política mira el movimiento) y luego la fila.
export async function deleteAttachment(attachment) {
  const { error: eFile } = await supabase.storage.from('receipts').remove([attachment.path]);
  if (eFile) throw new Error(eFile.message || 'No se pudo borrar el archivo');
  const { error } = await supabase.from('transaction_attachments').delete().eq('id', attachment.id);
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
    current_amount: 0, target_date: goal.targetDate, owner_member_id: goal.ownerMemberId || null,
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

// "Bolsillo": aportar mueve dinero de una cuenta hacia el objetivo como TRANSFERENCIA,
// no como gasto — no afecta los reportes de ingresos/gastos, pero sí reduce el saldo
// disponible de la cuenta (igual que retirar dinero de tu bolsillo para guardarlo aparte).
export async function contributeGoal(householdId, userId, goal, amount, memberId, accountId) {
  const { error: e1 } = await supabase.from('transactions').insert({
    household_id: householdId, type: 'transfer', description: `Aporte a "${goal.name}"`, amount,
    account_id: accountId, member_id: memberId, goal_id: goal.id, transfer_direction: 'deposit',
    date: new Date().toISOString().slice(0, 10), created_by: userId,
  });
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('goals').update({ current_amount: goal.currentAmount + amount }).eq('id', goal.id);
  if (e2) throw e2;
}

// Retirar dinero de un objetivo (individual: directo; familiar: pasa por solicitud/aprobación, ver abajo)
async function applyGoalWithdraw(householdId, userId, goal, amount, memberId, accountId) {
  const { error: e1 } = await supabase.from('transactions').insert({
    household_id: householdId, type: 'transfer', description: `Retiro de "${goal.name}"`, amount,
    account_id: accountId, member_id: memberId, goal_id: goal.id, transfer_direction: 'withdraw',
    date: new Date().toISOString().slice(0, 10), created_by: userId,
  });
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('goals').update({ current_amount: Math.max(0, goal.currentAmount - amount) }).eq('id', goal.id);
  if (e2) throw e2;
}

export async function editOrWithdrawGoal(householdId, userId, goal, action) {
  // objetivo individual (o sin dueño explícito, tratado como el propio usuario) -> se aplica directo
  if (goal.ownerMemberId) {
    if (action.type === 'edit_target') {
      const { error } = await supabase.from('goals').update({
        target_amount: action.newTargetAmount, target_date: action.newTargetDate,
      }).eq('id', goal.id);
      if (error) throw error;
    } else if (action.type === 'withdraw') {
      await applyGoalWithdraw(householdId, userId, goal, action.withdrawAmount, action.withdrawMemberId, action.withdrawAccountId);
    }
    return { immediate: true };
  }
  // objetivo familiar -> crea una solicitud que requiere aprobación unánime
  const { error } = await supabase.from('goal_change_requests').insert({
    goal_id: goal.id, household_id: householdId, requested_by: userId, change_type: action.type,
    new_target_amount: action.newTargetAmount ?? null, new_target_date: action.newTargetDate ?? null,
    withdraw_amount: action.withdrawAmount ?? null, withdraw_account_id: action.withdrawAccountId ?? null,
    withdraw_member_id: action.withdrawMemberId ?? null,
  });
  if (error) throw error;
  return { immediate: false };
}

export async function loadPendingGoalRequests(householdId) {
  const { data, error } = await supabase.from('goal_change_requests')
    .select('*, goals(name, target_amount, target_date, current_amount, owner_member_id), profiles!goal_change_requests_requested_by_fkey(full_name), goal_change_votes(member_id, approve)')
    .eq('household_id', householdId).eq('status', 'pending').order('created_at');
  if (error) throw error;
  return data.map((r) => ({
    id: r.id, goalId: r.goal_id, changeType: r.change_type,
    newTargetAmount: r.new_target_amount ? Number(r.new_target_amount) : null, newTargetDate: r.new_target_date,
    withdrawAmount: r.withdraw_amount ? Number(r.withdraw_amount) : null,
    withdrawAccountId: r.withdraw_account_id, withdrawMemberId: r.withdraw_member_id,
    requestedBy: r.requested_by, requestedByName: r.profiles?.full_name || 'Alguien',
    goalName: r.goals?.name, votes: r.goal_change_votes || [],
  }));
}

// Vota y resuelve en una sola llamada atómica del lado de la base de datos —
// evita la condición de carrera de votar y luego revisar aparte si ya se
// puede aplicar, y es la única forma de aplicar el cambio real: la base de
// datos tiene triggers que bloquean cualquier edición directa a un objetivo
// familiar que no pase por esta función.
export async function voteAndResolveGoalRequest(requestId, approve) {
  const { data, error } = await supabase.rpc('vote_and_resolve_goal_request', {
    p_request_id: requestId, p_approve: approve,
  });
  if (error) throw new Error(error.message.replace(/^.*: /, ''));
  return data; // 'approved' | 'rejected' | 'pending'
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

// Solo una tarjeta de crédito guarda cupo / corte / pago / tasa; en otra cuenta se limpian.
function cardColumns(a) {
  const isCard = a.paymentKind === 'tarjeta_credito';
  const n = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    credit_limit: isCard ? n(a.creditLimit) : null, statement_day: isCard ? n(a.statementDay) : null,
    payment_day: isCard ? n(a.paymentDay) : null, card_rate: isCard ? n(a.cardRate) : null,
  };
}
export async function addAccount(householdId, userId, account) {
  const { data: row, error } = await supabase.from('accounts').insert({
    household_id: householdId, name: account.name, type: account.type, owner_ids: account.ownerIds,
    payment_kind: account.paymentKind || 'otro', ...cardColumns(account),
  }).select().single();
  if (error) throw error;
  if (account.initialBalance && account.initialBalance > 0) {
    await supabase.from('transactions').insert({
      household_id: householdId, type: 'income', description: 'Saldo inicial',
      nature: 'apertura',
      amount: account.initialBalance, account_id: row.id, member_id: account.ownerIds?.[0] || userId,
      date: new Date().toISOString().slice(0, 10), is_shared: account.type === 'shared', created_by: userId,
    });
  }
  return row.id;
}
export async function updateAccount(id, account) {
  const { error } = await supabase.from('accounts').update({
    name: account.name, type: account.type, owner_ids: account.ownerIds,
    payment_kind: account.paymentKind || 'otro', ...cardColumns(account),
  }).eq('id', id);
  if (error) throw error;
}
export async function removeAccount(id) {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw error;
}

/* --------------------------- OBLIGACIONES --------------------------- */
export async function addObligation(householdId, userId, o) {
  const { error } = await supabase.from('obligations').insert({
    household_id: householdId, owner_member_id: o.ownerMemberId || null, name: o.name,
    amount: o.amount === '' || o.amount == null ? null : o.amount,
    category_id: o.categoryId || null, account_id: o.accountId || null,
    frequency: o.frequency, next_due_date: o.nextDueDate,
    time_of_day: o.timeOfDay, timezone: o.timezone, note: o.note || null,
    enabled: o.enabled !== false, created_by: userId,
  });
  if (error) throw error;
}
export async function updateObligation(id, o) {
  const { error } = await supabase.from('obligations').update({
    owner_member_id: o.ownerMemberId || null, name: o.name,
    amount: o.amount === '' || o.amount == null ? null : o.amount,
    category_id: o.categoryId || null, account_id: o.accountId || null,
    frequency: o.frequency, next_due_date: o.nextDueDate,
    time_of_day: o.timeOfDay, timezone: o.timezone, note: o.note || null,
    enabled: o.enabled !== false,
  }).eq('id', id);
  if (error) throw error;
}
export async function setObligationEnabled(id, enabled) {
  const { error } = await supabase.from('obligations').update({ enabled }).eq('id', id);
  if (error) throw error;
}
export async function removeObligation(id) {
  const { error } = await supabase.from('obligations').delete().eq('id', id);
  if (error) throw error;
}

export async function addCategory(householdId, category) {
  const { error } = await supabase.from('categories').insert({
    household_id: householdId, name: category.name, type: category.type, icon: category.icon,
    group_name: category.groupName || null, nature: category.nature || 'operativo', is_fixed: !!category.isFixed, tax_tag: category.taxTag || null,
  });
  if (error) throw error;
}
export async function setCategoryTaxTag(id, taxTag) {
  const { error } = await supabase.from('categories').update({ tax_tag: taxTag || null }).eq('id', id);
  if (error) throw error;
}
export async function updateCategory(id, category) {
  const { error } = await supabase.from('categories').update({
    name: category.name, icon: category.icon,
    group_name: category.groupName || null, nature: category.nature || 'operativo', is_fixed: !!category.isFixed,
  }).eq('id', id);
  if (error) throw error;
}
// Busca una categoría por nombre y tipo; si el hogar no la tiene (ej. hogares
// anteriores a la Fase 17), la crea con la clasificación por defecto.
export async function ensureCategory(householdId, spec) {
  const { data: found, error } = await supabase.from('categories').select('id')
    .eq('household_id', householdId).eq('name', spec.name).eq('type', spec.type).limit(1);
  if (error) throw error;
  if (found?.length) return found[0].id;
  const { data, error: e2 } = await supabase.from('categories').insert({
    household_id: householdId, name: spec.name, type: spec.type, icon: spec.icon,
    group_name: spec.group, nature: spec.nature, is_fixed: spec.fixed, tax_tag: spec.tax || null,
  }).select('id').single();
  if (e2) throw e2;
  return data.id;
}
export async function removeCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function updateHousehold(householdId, patch) {
  const dbPatch = {};
  if (patch.householdName !== undefined) dbPatch.name = patch.householdName;
  if (patch.currency !== undefined) dbPatch.currency = patch.currency;
  if (patch.approvalThreshold !== undefined) dbPatch.spend_approval_threshold = patch.approvalThreshold > 0 ? patch.approvalThreshold : null;
  const { error } = await supabase.from('households').update(dbPatch).eq('id', householdId);
  if (error) throw error;
}

/* ---------------------- SOLICITUDES DE GASTO ---------------------- */
export async function createSpendRequest(householdId, userId, r) {
  const { data, error } = await supabase.from('spend_requests').insert({
    household_id: householdId, requested_by: userId, title: r.title.trim(), amount: r.amount,
    category_id: r.categoryId || null, account_id: r.accountId || null, note: r.note?.trim() || null,
  }).select('id').single();
  if (error) throw error;
  return data.id;
}
export async function setSpendRequestStatus(id, status, transactionId = null) {
  const patch = { status };
  if (transactionId) patch.transaction_id = transactionId;
  const { error } = await supabase.from('spend_requests').update(patch).eq('id', id);
  if (error) throw error;
}
export async function voteSpendRequest(requestId, memberId, vote, comment) {
  const { error } = await supabase.from('spend_request_votes').upsert(
    { request_id: requestId, member_id: memberId, vote, comment: comment?.trim() || null },
    { onConflict: 'request_id,member_id' },
  );
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
    paymentSource: c.payment_source || 'cuenta', payrollEmployer: c.payroll_employer || '',
    payrollDay: c.payroll_day || null, autoRegister: !!c.auto_register,
  };
}
function dbPaymentToJs(p) {
  return {
    id: p.id, creditId: p.credit_id, installmentNumber: p.installment_number, dueDate: p.due_date,
    capital: Number(p.capital), interest: Number(p.interest), insurance: Number(p.insurance), total: Number(p.total),
    balanceAfter: Number(p.balance_after), paid: p.paid, paidDate: p.paid_date, transactionId: p.transaction_id,
    interestTransactionId: p.interest_transaction_id || null, paidUvrValue: p.paid_uvr_value ? Number(p.paid_uvr_value) : null,
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

const paymentRow = (creditId, r) => ({
  credit_id: creditId, installment_number: r.installmentNumber, due_date: r.dueDate,
  capital: r.capital, interest: r.interest, insurance: r.insurance, total: r.total, balance_after: r.balanceAfter,
});

// Reemplaza las cuotas NO pagadas por un calendario nuevo (abono, retanqueo, cambio
// de condiciones). Si falla el insert de las nuevas, restaura las anteriores para
// no dejar el crédito sin calendario.
async function replaceUnpaidRows(creditId, oldUnpaid, newRows) {
  const { error: eDel } = await supabase.from('credit_payments').delete().eq('credit_id', creditId).eq('paid', false);
  if (eDel) throw eDel;
  if (!newRows.length) return;
  const { error: eIns } = await supabase.from('credit_payments').insert(newRows.map((r) => paymentRow(creditId, r)));
  if (eIns) {
    await supabase.from('credit_payments').insert(oldUnpaid.map((p) => paymentRow(creditId, p)));
    throw eIns;
  }
}

// Historial del crédito (retanqueos, rediferidos, abonos…). Es informativo: si no
// se puede guardar, la operación principal ya se hizo y no debe deshacerse.
async function insertCreditEvent(creditId, userId, ev) {
  try {
    await supabase.from('credit_events').insert({
      credit_id: creditId, kind: ev.kind, event_date: ev.date || new Date().toISOString().slice(0, 10),
      amount: ev.amount ?? null, balance_before: ev.balanceBefore ?? null, balance_after: ev.balanceAfter ?? null,
      rate_before: ev.rateBefore ?? null, rate_after: ev.rateAfter ?? null,
      term_before: ev.termBefore ?? null, term_after: ev.termAfter ?? null,
      installment_before: ev.installmentBefore ?? null, installment_after: ev.installmentAfter ?? null,
      note: ev.note || null, created_by: userId,
    });
  } catch { /* historial opcional */ }
}

export async function loadCreditEvents(creditId) {
  const { data, error } = await supabase.from('credit_events').select('*, profiles(full_name)')
    .eq('credit_id', creditId).order('event_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((e) => ({
    id: e.id, kind: e.kind, date: e.event_date, amount: e.amount === null ? null : Number(e.amount),
    balanceBefore: e.balance_before === null ? null : Number(e.balance_before), balanceAfter: e.balance_after === null ? null : Number(e.balance_after),
    rateBefore: e.rate_before === null ? null : Number(e.rate_before), rateAfter: e.rate_after === null ? null : Number(e.rate_after),
    termBefore: e.term_before, termAfter: e.term_after,
    installmentBefore: e.installment_before === null ? null : Number(e.installment_before),
    installmentAfter: e.installment_after === null ? null : Number(e.installment_after),
    note: e.note, byName: e.profiles?.full_name || 'Alguien',
  }));
}

export async function createCredit(householdId, userId, credit) {
  const libranza = credit.paymentSource === 'libranza';
  // En una libranza la cuota vence el día de nómina; si no, un mes después del inicio.
  const firstDueDate = libranza && credit.payrollDay ? nextDateWithDay(credit.startDate, credit.payrollDay) : undefined;
  const { data: row, error } = await supabase.from('credits').insert({
    household_id: householdId, name: credit.name, credit_type: credit.creditType, currency: credit.currency,
    principal: credit.principal, annual_rate: credit.annualRate, term_months: credit.termMonths,
    amortization_system: credit.amortizationSystem, insurance_monthly: credit.insuranceMonthly,
    owner_member_id: credit.ownerMemberId || null, account_id: credit.accountId || null,
    start_date: credit.startDate, created_by: userId,
    payment_source: libranza ? 'libranza' : 'cuenta', payroll_employer: libranza ? (credit.payrollEmployer || null) : null,
    payroll_day: libranza ? (credit.payrollDay || null) : null, auto_register: libranza && !!credit.autoRegister,
  }).select().single();
  if (error) throw error;

  const schedule = generateSchedule({
    principal: credit.principal, annualRate: credit.annualRate, termMonths: credit.termMonths,
    system: credit.amortizationSystem, insuranceMonthly: credit.insuranceMonthly, startDate: credit.startDate, firstDueDate,
  });
  const alreadyPaid = Math.min(credit.installmentsAlreadyPaid || 0, schedule.length);
  const { error: e2 } = await supabase.from('credit_payments').insert(
    schedule.map((r, i) => ({
      ...paymentRow(row.id, r),
      // las cuotas ya pagadas antes de usar la app se marcan pagadas, sin generar un gasto retroactivo
      paid: i < alreadyPaid,
    }))
  );
  if (e2) throw e2;

  // Préstamo recibido ahora: el desembolso entra como ingreso de financiamiento
  // (el pasivo ya queda en el crédito). Solo créditos en la moneda del hogar.
  if (credit.registerDisbursement && credit.accountId && credit.currency !== 'UVR') {
    const categoryId = await ensureCategory(householdId, LOAN_INCOME_CATEGORY);
    const { error: e3 } = await supabase.from('transactions').insert({
      household_id: householdId, type: 'income', description: `Desembolso — ${credit.name}`,
      amount: credit.principal, category_id: categoryId, account_id: credit.accountId,
      member_id: credit.ownerMemberId || userId, date: credit.startDate, recurring: false,
      is_shared: !credit.ownerMemberId, nature: 'financiamiento', created_by: userId,
    });
    if (e3) throw e3;
  }
  await insertCreditEvent(row.id, userId, {
    kind: 'creacion', date: credit.startDate, amount: credit.principal, balanceAfter: credit.principal,
    rateAfter: credit.annualRate, termAfter: credit.termMonths, installmentAfter: schedule[0]?.total,
  });
  return row.id;
}

export async function deleteCredit(id) {
  const { error } = await supabase.from('credits').delete().eq('id', id);
  if (error) throw error;
}

// Edita un crédito y, si cambió algo que afecta el cálculo (tasa, plazo,
// sistema), recalcula las cuotas NO pagadas desde el saldo actual — las ya
// pagadas quedan intactas (son historia real, no se tocan). Conserva el
// vencimiento de la próxima cuota y los seguros vigentes.
export async function updateCreditAndRecalc(creditId, patch, currentCredit, payments, userId) {
  const libranza = patch.paymentSource === 'libranza';
  const { error: e1 } = await supabase.from('credits').update({
    name: patch.name, credit_type: patch.creditType, owner_member_id: patch.ownerMemberId || null,
    account_id: patch.accountId || null, annual_rate: patch.annualRate, term_months: patch.termMonths,
    amortization_system: patch.amortizationSystem,
    payment_source: libranza ? 'libranza' : 'cuenta', payroll_employer: libranza ? (patch.payrollEmployer || null) : null,
    payroll_day: libranza ? (patch.payrollDay || null) : null, auto_register: libranza && !!patch.autoRegister,
  }).eq('id', creditId);
  if (e1) throw e1;

  const affectsSchedule = (
    patch.annualRate !== currentCredit.annualRate ||
    patch.termMonths !== currentCredit.termMonths ||
    patch.amortizationSystem !== currentCredit.amortizationSystem
  );
  if (!affectsSchedule) return;

  const unpaid = payments.filter((p) => !p.paid).sort((a, b) => a.installmentNumber - b.installmentNumber);
  if (!unpaid.length) return;
  const paidCount = payments.length - unpaid.length;
  const currentBalance = creditOutstandingBalance(currentCredit, payments);
  const newRows = generateSchedule({
    principal: currentBalance, annualRate: patch.annualRate, termMonths: Math.max(1, patch.termMonths - paidCount),
    system: patch.amortizationSystem, insuranceMonthly: currentCredit.insuranceMonthly,
    firstDueDate: unpaid[0].dueDate, startInstallment: unpaid[0].installmentNumber,
  });
  await replaceUnpaidRows(creditId, unpaid, newRows);
  await recalcInsuranceOnPayments(creditId);
  await insertCreditEvent(creditId, userId, {
    kind: 'cambio_condiciones', balanceBefore: currentBalance, balanceAfter: currentBalance,
    rateBefore: currentCredit.annualRate, rateAfter: patch.annualRate,
    termBefore: unpaid.length, termAfter: newRows.length, installmentBefore: unpaid[0].total, installmentAfter: newRows[0]?.total,
  });
}

/* ---------------------- SEGUROS DE CRÉDITO (con vigencia) ---------------------- */
export async function loadCreditInsurances(creditId) {
  const { data, error } = await supabase.from('credit_insurances').select('*').eq('credit_id', creditId).order('valid_from');
  if (error) throw error;
  return data.map((i) => ({
    id: i.id, type: i.insurance_type, monthlyValue: Number(i.monthly_value),
    validFrom: i.valid_from, validTo: i.valid_to, active: i.active,
  }));
}

export async function addCreditInsurance(creditId, insurance) {
  const { error } = await supabase.from('credit_insurances').insert({
    credit_id: creditId, insurance_type: insurance.type, monthly_value: insurance.monthlyValue,
    valid_from: insurance.validFrom, valid_to: insurance.validTo,
  });
  if (error) throw error;
  await recalcInsuranceOnPayments(creditId);
}

export async function removeCreditInsurance(id, creditId) {
  const { error } = await supabase.from('credit_insurances').delete().eq('id', id);
  if (error) throw error;
  await recalcInsuranceOnPayments(creditId);
}

// Recalcula el campo "insurance"/"total" de cada cuota NO pagada, sumando los
// seguros activos cuya vigencia cubre la fecha de esa cuota. Las cuotas ya
// pagadas conservan el valor de seguro que tenían en su momento (historia real).
async function recalcInsuranceOnPayments(creditId) {
  const [{ data: insurances, error: e1 }, { data: payments, error: e2 }] = await Promise.all([
    supabase.from('credit_insurances').select('*').eq('credit_id', creditId).eq('active', true),
    supabase.from('credit_payments').select('*').eq('credit_id', creditId).eq('paid', false),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  // sin seguros con vigencia registrados se conserva el seguro fijo con el que se generaron las cuotas
  if (!insurances.length) return;

  const updates = payments.map((p) => {
    const dueDate = p.due_date;
    const insuranceTotal = insurances
      .filter((i) => i.valid_from <= dueDate && dueDate <= i.valid_to)
      .reduce((s, i) => s + Number(i.monthly_value), 0);
    return { id: p.id, insurance: insuranceTotal, total: Number(p.capital) + Number(p.interest) + insuranceTotal };
  });
  await Promise.all(updates.map((u) => supabase.from('credit_payments').update({ insurance: u.insurance, total: u.total }).eq('id', u.id)));
}

/* ---------------------- TRANSFERENCIAS ENTRE INTEGRANTES ---------------------- */
export async function addMemberTransfer(householdId, userId, { amount, description, fromMemberId, fromAccountId, toMemberId, toAccountId, date, settlesDebt }) {
  const { error } = await supabase.from('transactions').insert({
    household_id: householdId, type: 'transfer', description: description || 'Transferencia entre integrantes',
    amount, account_id: fromAccountId || null, member_id: fromMemberId,
    to_member_id: toMemberId, to_account_id: toAccountId || null,
    date, created_by: userId, settles_debt: !!settlesDebt,
  });
  if (error) throw error;
}

// Registra el pago de una cuota. Contablemente son DOS cosas: el capital baja el
// pasivo (financiamiento, no es gasto) y los intereses + seguro sí son gasto.
//  options: { paidDate, uvrValue (créditos en UVR: se convierte a pesos), libranza }
// La cuota se "reclama" primero (paid=false → true en una sola operación) para que
// un doble clic, o dos dispositivos a la vez, no la registren dos veces.
export async function markInstallmentPaid(householdId, userId, credit, installment, accountId, memberId, categoryId, options = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const paidDate = options.paidDate || today;
  const { capital, cost, total } = installmentInCop(installment, credit, options.uvrValue);

  const { data: claimed, error: eClaim } = await supabase.from('credit_payments').update({
    paid: true, paid_date: paidDate, paid_uvr_value: credit.currency === 'UVR' ? options.uvrValue : null,
  }).eq('id', installment.id).eq('paid', false).select('id');
  if (eClaim) throw eClaim;
  if (!claimed?.length) throw new Error('Esta cuota ya estaba registrada como pagada.');

  try {
    const base = {
      household_id: householdId, type: 'expense', account_id: accountId, member_id: memberId,
      date: paidDate, recurring: false, is_shared: !credit.ownerMemberId, created_by: userId,
    };
    const label = `${options.libranza ? 'Descuento de nómina' : 'Cuota'} ${installment.installmentNumber}/${credit.termMonths} — ${credit.name}`;
    const { data: tx, error: e1 } = await supabase.from('transactions').insert({
      ...base, description: capital > 0 && cost > 0 ? `${label} (capital)` : label,
      amount: capital > 0 ? capital : total, category_id: categoryId, nature: 'financiamiento',
    }).select().single();
    if (e1) throw e1;
    let interestTxId = null;
    if (capital > 0 && cost > 0) {
      const interestCategoryId = await ensureCategory(householdId, INTEREST_CATEGORY);
      const { data: itx, error: eI } = await supabase.from('transactions').insert({
        ...base, description: `${label} (intereses y seguro)`, amount: cost, category_id: interestCategoryId, nature: 'operativo',
      }).select().single();
      if (eI) throw eI;
      interestTxId = itx.id;
    }
    const { error: e2 } = await supabase.from('credit_payments').update({
      transaction_id: tx.id, interest_transaction_id: interestTxId,
    }).eq('id', installment.id);
    if (e2) throw e2;
  } catch (err) {
    // no dejar la cuota marcada como pagada sin sus movimientos
    await supabase.from('credit_payments').update({ paid: false, paid_date: null, paid_uvr_value: null }).eq('id', installment.id);
    throw err;
  }

  // si era la última cuota, marca el crédito como pagado
  const { count } = await supabase.from('credit_payments').select('id', { count: 'exact', head: true })
    .eq('credit_id', credit.id).eq('paid', false);
  if (count === 0) {
    await supabase.from('credits').update({ status: 'pagado' }).eq('id', credit.id);
  }
}

// Deshace el ÚLTIMO pago registrado (ej. se marcó por error): borra sus movimientos
// y vuelve a dejar la cuota pendiente. Solo la última, para no descuadrar el saldo.
export async function unmarkInstallmentPaid(userId, credit, installment, payments) {
  const lastPaid = [...payments].filter((p) => p.paid).sort((a, b) => a.installmentNumber - b.installmentNumber).pop();
  if (!lastPaid || lastPaid.id !== installment.id) throw new Error('Solo se puede revertir el último pago registrado.');
  const { error: e1 } = await supabase.from('credit_payments').update({
    paid: false, paid_date: null, transaction_id: null, interest_transaction_id: null, paid_uvr_value: null,
  }).eq('id', installment.id);
  if (e1) throw e1;
  const txIds = [installment.transactionId, installment.interestTransactionId].filter(Boolean);
  if (txIds.length) {
    const { error: e2 } = await supabase.from('transactions').delete().in('id', txIds);
    if (e2) throw new Error('La cuota volvió a quedar pendiente, pero no se pudieron borrar sus movimientos: bórralos a mano en Movimientos.');
  }
  if (credit.status === 'pagado') await supabase.from('credits').update({ status: 'activo' }).eq('id', credit.id);
  await insertCreditEvent(credit.id, userId, { kind: 'pago_revertido', note: `Cuota ${installment.installmentNumber}` });
}

// Abono a capital: recalcula las cuotas que faltan (menos plazo o menos cuota).
// uvrValue: para créditos en UVR, convierte el abono a pesos al registrarlo como movimiento.
export async function applyExtraPayment(householdId, userId, credit, payments, extraAmount, strategy, applyDate, accountId, memberId, categoryId, registerAsExpense, uvrValue) {
  const unpaid = payments.filter((p) => !p.paid).sort((a, b) => a.installmentNumber - b.installmentNumber);
  if (!unpaid.length) throw new Error('Este crédito ya no tiene cuotas pendientes.');
  const currentBalance = creditOutstandingBalance(credit, payments);
  if (extraAmount > currentBalance + 0.01) throw new Error('El abono no puede ser mayor que el saldo del crédito.');
  if (registerAsExpense && credit.currency === 'UVR' && !(uvrValue > 0)) throw new Error('Falta el valor de la UVR para registrar el abono en pesos.');

  const newRows = recalcAfterExtraPayment({
    currentBalance, extraAmount, strategy, annualRate: credit.annualRate, system: credit.amortizationSystem,
    remainingMonths: unpaid.length, insuranceMonthly: credit.insuranceMonthly, fromDate: applyDate,
    firstDueDate: unpaid[0].dueDate, nextInstallmentNumber: unpaid[0].installmentNumber,
  });

  await replaceUnpaidRows(credit.id, unpaid, newRows);
  if (!newRows.length) await supabase.from('credits').update({ status: 'pagado' }).eq('id', credit.id);
  else await recalcInsuranceOnPayments(credit.id);

  const { error: eExtra } = await supabase.from('credit_extra_payments').insert({
    credit_id: credit.id, amount: extraAmount, strategy, applied_date: applyDate, created_by: userId,
  });
  if (eExtra) throw eExtra;

  if (registerAsExpense) {
    const { error: eTx } = await supabase.from('transactions').insert({
      household_id: householdId, type: 'expense', description: `Abono a capital — ${credit.name}`,
      amount: Math.round(extraAmount * (credit.currency === 'UVR' ? uvrValue : 1) * 100) / 100,
      category_id: categoryId, account_id: accountId, member_id: memberId, nature: 'financiamiento',
      date: applyDate, recurring: false, is_shared: !credit.ownerMemberId, created_by: userId,
    });
    if (eTx) throw eTx;
  }
  await insertCreditEvent(credit.id, userId, {
    kind: 'abono', date: applyDate, amount: extraAmount, note: strategy === 'reducir_plazo' ? 'Redujo el plazo' : 'Redujo la cuota',
    balanceBefore: currentBalance, balanceAfter: Math.max(0, currentBalance - extraAmount),
    termBefore: unpaid.length, termAfter: newRows.length, installmentBefore: unpaid[0].total, installmentAfter: newRows[0]?.total,
  });
}

// Retanqueo (dinero nuevo sobre el mismo crédito) o rediferido / reestructuración
// (mismo saldo, nuevo plazo y/o tasa). Recalcula las cuotas que faltan sobre el saldo
// nuevo — puede cambiar la cuota, el saldo y la tasa; las cuotas ya pagadas no se tocan.
//  o: { kind: 'retanqueo'|'rediferido', topUp, annualRate (E.A. %), termMonths (cuotas que faltarán),
//       date, firstDueDate?, accountId, memberId, registerDisbursement, note }
export async function refinanceCredit(householdId, userId, credit, payments, o) {
  const unpaid = payments.filter((p) => !p.paid).sort((a, b) => a.installmentNumber - b.installmentNumber);
  if (!unpaid.length) throw new Error('Este crédito ya no tiene cuotas pendientes.');
  const topUp = o.kind === 'retanqueo' ? (Number(o.topUp) || 0) : 0;
  if (o.kind === 'retanqueo' && topUp <= 0) throw new Error('Indica cuánto dinero nuevo recibes en el retanqueo.');
  const balanceBefore = creditOutstandingBalance(credit, payments);
  const { rows, newBalance, summary } = buildRefinance({
    currentBalance: balanceBefore, topUp, annualRate: o.annualRate, termMonths: o.termMonths,
    system: credit.amortizationSystem, insuranceMonthly: credit.insuranceMonthly,
    firstDueDate: o.firstDueDate || unpaid[0].dueDate, nextInstallmentNumber: unpaid[0].installmentNumber,
  });

  await replaceUnpaidRows(credit.id, unpaid, rows);
  const paidCount = payments.length - unpaid.length;
  const { error: eCred } = await supabase.from('credits').update({
    annual_rate: o.annualRate, term_months: paidCount + rows.length, status: 'activo',
  }).eq('id', credit.id);
  if (eCred) throw eCred;
  await recalcInsuranceOnPayments(credit.id);

  // el dinero nuevo entra a la cuenta como ingreso de financiamiento (pasivo ya está en el crédito)
  if (topUp > 0 && o.registerDisbursement && o.accountId && credit.currency !== 'UVR') {
    const categoryId = await ensureCategory(householdId, LOAN_INCOME_CATEGORY);
    const { error: eTx } = await supabase.from('transactions').insert({
      household_id: householdId, type: 'income', description: `Retanqueo — ${credit.name}`,
      amount: topUp, category_id: categoryId, account_id: o.accountId, member_id: o.memberId || userId,
      date: o.date, recurring: false, is_shared: !credit.ownerMemberId, nature: 'financiamiento', created_by: userId,
    });
    if (eTx) throw eTx;
  }
  await insertCreditEvent(credit.id, userId, {
    kind: o.kind, date: o.date, amount: topUp || null, note: o.note,
    balanceBefore, balanceAfter: newBalance, rateBefore: credit.annualRate, rateAfter: o.annualRate,
    termBefore: unpaid.length, termAfter: rows.length, installmentBefore: unpaid[0].total, installmentAfter: rows[0]?.total,
  });
  return { balanceBefore, balanceAfter: newBalance, summary };
}

// Libranza con registro automático: al abrir la app, registra como descontadas de la
// nómina las cuotas que ya vencieron. Solo lo hace quien es el responsable del crédito
// (el empleado), y la cuota se "reclama" antes de registrarla, así que abrir la app en
// dos dispositivos no la duplica. Devuelve cuántas cuotas registró.
export async function applyDuePayrollDeductions(householdId, userId) {
  const { data: rows, error } = await supabase.from('credits').select('*')
    .eq('household_id', householdId).eq('payment_source', 'libranza').eq('auto_register', true)
    .eq('owner_member_id', userId).neq('status', 'pagado');
  if (error) throw error;
  const credits = rows.map(dbCreditToJs).filter((c) => c.accountId && c.currency !== 'UVR');
  if (!credits.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const debtCategoryId = await ensureCategory(householdId, DEBT_CATEGORY);
  let registered = 0;
  for (const credit of credits) {
    const payments = await loadCreditPayments(credit.id);
    for (const installment of dueLibranzaInstallments(credit, payments, today)) {
      try {
        await markInstallmentPaid(householdId, userId, credit, installment, credit.accountId, userId, debtCategoryId,
          { paidDate: installment.dueDate, libranza: true });
        registered++;
      } catch { break; /* si una cuota falla, no seguir con las siguientes de este crédito */ }
    }
  }
  return registered;
}

/* ---------------------- TARJETAS DE CRÉDITO ---------------------- */
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function insertPlanEvent(planId, userId, ev) {
  try {
    await supabase.from('card_plan_events').insert({
      plan_id: planId, kind: ev.kind, event_date: ev.date || new Date().toISOString().slice(0, 10),
      amount: ev.amount ?? null, balance_before: ev.balanceBefore ?? null, balance_after: ev.balanceAfter ?? null,
      rate_before: ev.rateBefore ?? null, rate_after: ev.rateAfter ?? null, term_before: ev.termBefore ?? null, term_after: ev.termAfter ?? null,
      installment_before: ev.installmentBefore ?? null, installment_after: ev.installmentAfter ?? null, note: ev.note || null, created_by: userId,
    });
  } catch { /* el historial es un extra: si falla no debe deshacer la operación */ }
}

// Compra diferida: crea el plan de cuotas ligado al movimiento de la compra.
async function createCardPlan(householdId, userId, t, transactionId) {
  const cp = t.cardPlan;
  const { data: plan, error } = await supabase.from('card_plans').insert({
    household_id: householdId, account_id: t.accountId, transaction_id: transactionId, member_id: t.memberId,
    description: t.description || 'Compra con tarjeta', principal: t.amount, annual_rate: cp.annualRate || 0,
    installments: cp.installments, first_bill_date: cp.firstBillDate, created_by: userId,
  }).select().single();
  if (error) {
    if (error.code === '23505') return; // ya se había creado en un intento anterior
    throw error;
  }
  const first = planOverview(dbPlanToJs(plan)).next;
  await insertPlanEvent(plan.id, userId, {
    kind: 'creacion', date: t.date, amount: t.amount, balanceAfter: t.amount, rateAfter: cp.annualRate || 0,
    termAfter: cp.installments, installmentAfter: first ? round2(first.capital + first.interest) : null,
  });
}

export async function loadCardPlanEvents(planId) {
  const { data, error } = await supabase.from('card_plan_events').select('*').eq('plan_id', planId)
    .order('event_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((e) => ({
    id: e.id, kind: e.kind, date: e.event_date, amount: e.amount === null ? null : Number(e.amount),
    balanceBefore: e.balance_before === null ? null : Number(e.balance_before), balanceAfter: e.balance_after === null ? null : Number(e.balance_after),
    rateBefore: e.rate_before === null ? null : Number(e.rate_before), rateAfter: e.rate_after === null ? null : Number(e.rate_after),
    termBefore: e.term_before, termAfter: e.term_after,
    installmentBefore: e.installment_before === null ? null : Number(e.installment_before),
    installmentAfter: e.installment_after === null ? null : Number(e.installment_after), note: e.note,
  }));
}

// Rediferir: el capital que sigue diferido se reparte de nuevo (otro plazo y/o tasa) y,
// opcionalmente, se le abona a capital. Solo cambia el plan: no se crea ningún
// movimiento (el abono se paga aparte con "Pagar tarjeta").
export async function redeferCardPlan(userId, plan, { annualRate, installments, extraPayment = 0, note, date }) {
  const r = buildRedefer(plan, { annualRate, installments, extraPayment });
  if (r.balanceBefore <= 0) throw new Error('Este plan ya no tiene cuotas por facturar.');
  if (extraPayment > r.balanceBefore + 0.005) throw new Error('El abono no puede ser mayor al capital que sigue diferido.');
  const payoff = r.plan.status === 'pagado';
  const patch = payoff
    ? { status: 'pagado', billed_count: plan.installments }
    : { principal: r.plan.principal, annual_rate: annualRate, installments, first_bill_date: r.plan.firstBillDate, billed_count: 0, status: 'activo' };
  // solo si el plan no cambió mientras tanto (ej. se facturó una cuota en otro dispositivo)
  const { data: upd, error } = await supabase.from('card_plans').update(patch)
    .eq('id', plan.id).eq('billed_count', plan.billedCount).select('id');
  if (error) throw error;
  if (!upd?.length) throw new Error('El plan cambió mientras lo editabas. Recarga e inténtalo de nuevo.');
  const changed = Math.abs(annualRate - plan.annualRate) > 0.0001 || installments !== r.before.total - r.before.billed;
  await insertPlanEvent(plan.id, userId, {
    kind: extraPayment > 0 && !changed ? 'abono' : 'rediferido', date, amount: extraPayment || null, note,
    balanceBefore: r.balanceBefore, balanceAfter: r.balanceAfter, rateBefore: plan.annualRate, rateAfter: annualRate,
    termBefore: r.before.total - r.before.billed, termAfter: payoff ? 0 : installments,
    installmentBefore: r.before.next ? round2(r.before.next.capital + r.before.next.interest) : null,
    installmentAfter: r.after.next ? round2(r.after.next.capital + r.after.next.interest) : null,
  });
  return r;
}

export async function deleteCardPlan(planId) {
  const { error } = await supabase.from('card_plans').delete().eq('id', planId);
  if (error) throw error;
}

// Pagar la tarjeta: es una TRANSFERENCIA desde una cuenta hacia la tarjeta (baja la deuda,
// no es un gasto: el gasto ya se registró al comprar).
export async function payCreditCard(householdId, userId, { cardAccountId, cardName, fromAccountId, amount, date, memberId }) {
  if (!(amount > 0)) throw new Error('Ingresa un monto válido.');
  if (fromAccountId === cardAccountId) throw new Error('Elige una cuenta de origen distinta a la tarjeta.');
  const { error } = await supabase.from('transactions').insert({
    household_id: householdId, type: 'transfer', description: `Pago tarjeta — ${cardName}`, amount,
    account_id: fromAccountId, member_id: memberId || userId, to_member_id: memberId || userId, to_account_id: cardAccountId,
    date, created_by: userId, settles_debt: false,
  });
  if (error) throw error;
}

// Al abrir la app: factura las cuotas de compras diferidas cuyo corte ya llegó. Cada cuota
// se "reclama" antes (billed_count k → k+1) para que dos dispositivos no la cobren dos
// veces. El capital ya se gastó al comprar; aquí solo se registra el INTERÉS como gasto.
export async function applyDueCardBilling(householdId, userId) {
  const { data: rows, error } = await supabase.from('card_plans').select('*')
    .eq('household_id', householdId).eq('created_by', userId).eq('status', 'activo');
  if (error) throw error;
  const plans = rows.map(dbPlanToJs);
  if (!plans.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  let billed = 0;
  let interestCategoryId = null;
  for (const plan of plans) {
    for (const row of duePlanInstallments(plan, today)) {
      const k = plan.billedCount;
      const { data: claimed, error: eClaim } = await supabase.from('card_plans')
        .update({ billed_count: k + 1, status: k + 1 >= plan.installments ? 'pagado' : 'activo' })
        .eq('id', plan.id).eq('billed_count', k).select('id');
      if (eClaim) throw eClaim;
      if (!claimed?.length) break; // otro dispositivo ya la facturó
      plan.billedCount = k + 1;
      const interest = round2(row.interest);
      if (interest > 0) {
        try {
          interestCategoryId ||= await ensureCategory(householdId, INTEREST_CATEGORY);
          const { error: eTx } = await supabase.from('transactions').insert({
            household_id: householdId, type: 'expense', account_id: plan.accountId, member_id: plan.memberId || userId,
            description: `Intereses cuota ${row.installmentNumber}/${plan.installments} — ${plan.description}`,
            amount: interest, category_id: interestCategoryId, nature: 'operativo', date: row.dueDate,
            recurring: false, is_shared: false, created_by: userId,
          });
          if (eTx) throw eTx;
        } catch (e) {
          await supabase.from('card_plans').update({ billed_count: k, status: 'activo' }).eq('id', plan.id);
          throw e;
        }
      }
      await insertPlanEvent(plan.id, userId, {
        kind: 'cobro', date: row.dueDate, amount: interest, balanceAfter: round2(row.balanceAfter),
        installmentAfter: round2(row.capital + row.interest), note: `Cuota ${row.installmentNumber}/${plan.installments}`,
      });
      billed++;
    }
  }
  return billed;
}

/* ---------------------- UVR ---------------------- */
export async function getLatestUvr() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/uvr', {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
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
    .select('id, name, currency, created_at, household_members(user_id, role, profiles(full_name))');
  if (error) throw error;
  return data
    .map((h) => ({
      id: h.id, name: h.name, currency: h.currency, createdAt: h.created_at,
      memberCount: h.household_members?.length || 0,
      members: (h.household_members || []).map((m) => ({ userId: m.user_id, name: m.profiles?.full_name || 'Integrante' })),
      memberNames: (h.household_members || []).map((m) => m.profiles?.full_name || 'Integrante').join(', '),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ---------------------- VERIFICACIÓN EN DOS PASOS (TOTP) ---------------------- */
export async function mfaListFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp || []).map((f) => ({ id: f.id, status: f.status, friendlyName: f.friendly_name }));
}
// Crea el factor (aún sin verificar). Primero limpia los que quedaron a medias de un intento anterior.
export async function mfaEnroll() {
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of (list?.all || []).filter((x) => x.status === 'unverified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Finanzas ${new Date().toISOString()}` });
  if (error) throw error;
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}
export async function mfaVerifyEnroll(factorId, code) {
  const { data: ch, error: e1 } = await supabase.auth.mfa.challenge({ factorId });
  if (e1) throw e1;
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
  if (error) throw error;
}
export async function mfaUnenroll(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
// ¿La sesión necesita el código? (tiene un factor verificado y todavía no lo ha pasado). null = no se pudo saber.
export async function mfaNeedsChallenge() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return null;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}
export async function mfaVerifyLogin(code) {
  const { data: list, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const factor = (list?.totp || []).find((f) => f.status === 'verified');
  if (!factor) throw new Error('No hay un factor de verificación activo.');
  await mfaVerifyEnroll(factor.id, code);
}

/* ---------------------- GESTIÓN DE USUARIOS ---------------------- */
// 'active' | 'deactivated' | 'suspended'. Si no se puede leer, se asume activa (no bloquear por un fallo).
export async function getMyAccountStatus(userId) {
  const { data, error } = await supabase.from('profiles').select('status').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.status || 'active';
}
export async function deactivateMyAccount() {
  const { error } = await supabase.rpc('deactivate_my_account');
  if (error) throw new Error(error.message.replace(/^.*: /, ''));
}
export async function reactivateMyAccount() {
  const { error } = await supabase.rpc('reactivate_my_account');
  if (error) throw new Error(error.message.replace(/^.*: /, ''));
}
export async function touchLastSeen() {
  try { await supabase.rpc('touch_last_seen'); } catch { /* es solo informativo */ }
}
export async function adminListUsers() {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw new Error(error.message.replace(/^.*: /, ''));
  return data.map((u) => ({
    userId: u.user_id, name: u.full_name, email: u.email, status: u.status, lastSeenAt: u.last_seen_at,
    createdAt: u.created_at, isAdmin: u.is_admin, households: u.households, statusChangedAt: u.status_changed_at,
  }));
}
export async function adminSetUserStatus(userId, status, reason) {
  const { error } = await supabase.rpc('admin_set_user_status', { p_user: userId, p_status: status, p_reason: reason });
  if (error) throw new Error(error.message.replace(/^.*: /, ''));
}

export async function loadCronHeartbeat() {
  const { data, error } = await supabase.from('cron_heartbeat').select('*').eq('job', 'send-reminders').maybeSingle();
  if (error) throw error;
  return data ? { lastRunAt: data.last_run_at, lastOk: data.last_ok, sent: data.sent, detail: data.detail, durationMs: data.duration_ms } : null;
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
    .limit(200);
  if (error) throw error;
  return data.map((n) => ({
    id: n.id, type: n.type, title: n.title, body: n.body, data: n.data,
    read: n.read, createdAt: n.created_at, userId: n.user_id,
  }));
}

// Estado (leída / archivada / eliminada) de esta persona; la política RLS ya filtra por ella.
export async function loadNotificationStates() {
  const { data, error } = await supabase.from('notification_states').select('notification_id, read_at, archived_at, deleted_at');
  if (error) throw error;
  return data.map((s) => ({ notificationId: s.notification_id, readAt: s.read_at, archivedAt: s.archived_at, deletedAt: s.deleted_at }));
}

// Una fila de estado por (notificación, persona): solo se escriben las columnas del parche.
export async function setNotificationStates(userId, ids, patch) {
  if (!ids.length) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from('notification_states').upsert(
    ids.map((id) => ({ notification_id: id, user_id: userId, ...patch, updated_at: now })),
    { onConflict: 'notification_id,user_id' },
  );
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

export async function getUserNotificationPrefs(userId) {
  const { data, error } = await supabase.from('user_notification_prefs').select('type, enabled').eq('user_id', userId);
  if (error) throw error;
  const obj = {};
  data.forEach((r) => { obj[r.type] = r.enabled; });
  return obj;
}
export async function setUserNotificationPref(userId, type, enabled) {
  const { error } = await supabase.from('user_notification_prefs').upsert({ user_id: userId, type, enabled }, { onConflict: 'user_id,type' });
  if (error) throw error;
}

/* ---------------------------------------------------------------------- */
/* NOTIFICACIONES PUSH — RECORDATORIOS PARAMETRIZABLES POR USUARIO         */
/* ---------------------------------------------------------------------- */
export async function savePushSubscription(userId, subscription) {
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId, endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh, auth: subscription.keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function removePushSubscription(endpoint) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}

export async function hasPushSubscription(userId, endpoint) {
  const { data, error } = await supabase.from('push_subscriptions').select('id').eq('user_id', userId).eq('endpoint', endpoint).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function loadReminderSchedules(userId) {
  const { data, error } = await supabase.from('reminder_schedules').select('*').eq('user_id', userId).order('time_of_day');
  if (error) throw error;
  return data.map((r) => ({
    id: r.id, label: r.label, timeOfDay: r.time_of_day, timezone: r.timezone,
    daysOfWeek: r.days_of_week, enabled: r.enabled,
  }));
}

export async function addReminderSchedule(userId, schedule) {
  const { error } = await supabase.from('reminder_schedules').insert({
    user_id: userId, label: schedule.label, time_of_day: schedule.timeOfDay,
    timezone: schedule.timezone, days_of_week: schedule.daysOfWeek,
  });
  if (error) throw error;
}

export async function updateReminderSchedule(id, patch) {
  const dbPatch = {};
  if ('label' in patch) dbPatch.label = patch.label;
  if ('timeOfDay' in patch) dbPatch.time_of_day = patch.timeOfDay;
  if ('daysOfWeek' in patch) dbPatch.days_of_week = patch.daysOfWeek;
  if ('enabled' in patch) dbPatch.enabled = patch.enabled;
  const { error } = await supabase.from('reminder_schedules').update(dbPatch).eq('id', id);
  if (error) throw error;
}

export async function removeReminderSchedule(id) {
  const { error } = await supabase.from('reminder_schedules').delete().eq('id', id);
  if (error) throw error;
}

/* ---------------------- SUGERENCIAS DE MEJORA ---------------------- */
function dbSuggestion(r) {
  return {
    id: r.id, userId: r.user_id, householdId: r.household_id, title: r.title, description: r.description,
    source: r.source, status: r.status, adminNote: r.admin_note, reviewedBy: r.reviewed_by,
    createdAt: r.created_at, updatedAt: r.updated_at,
    authorName: r.author?.full_name || null, householdName: r.households?.name || null,
    events: (r.suggestion_events || [])
      .map((e) => ({ id: e.id, status: e.status, note: e.note, createdAt: e.created_at }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export async function addSuggestion(userId, householdId, { title, description, source = 'asistente' }) {
  const { data, error } = await supabase.from('suggestions')
    .insert({ user_id: userId, household_id: householdId, title, description, source })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

// Push a los administradores (best-effort: el aviso dentro de la app ya lo
// creó un trigger, así que si esto falla la sugerencia igual llegó).
export async function notifyAdminsOfSuggestion(suggestionId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/notify-suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ suggestionId }),
    });
  } catch { /* sin push, queda el aviso dentro de la app */ }
}

export async function loadMySuggestions(userId) {
  const { data, error } = await supabase.from('suggestions')
    .select('*, suggestion_events(*)').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(dbSuggestion);
}

// Solo para administradores de la plataforma (la base lo exige con RLS).
export async function listAllSuggestions() {
  const { data, error } = await supabase.from('suggestions')
    .select('*, author:profiles!suggestions_user_id_fkey(full_name), households(name), suggestion_events(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(dbSuggestion);
}

export async function updateSuggestion(id, actorId, { status, adminNote }) {
  const note = (adminNote || '').trim() || null;
  const { error } = await supabase.from('suggestions')
    .update({ status, admin_note: note, reviewed_by: actorId, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  const { error: e2 } = await supabase.from('suggestion_events').insert({ suggestion_id: id, actor_id: actorId, status, note });
  if (e2) throw e2;
}
