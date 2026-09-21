// Plantillas / favoritos de movimientos ("Mercado D1", "Gasolina", "Almuerzo") — lógica pura.

// Valores que una plantilla le pone al formulario de un movimiento nuevo. Una cuenta que esta persona no
// ve (plantilla del hogar creada con una cuenta individual de otro) se ignora.
export function templateToForm(template, { accounts, categories }) {
  const account = accounts.find((a) => a.id === template.accountId);
  const category = categories.find((c) => c.id === template.categoryId && c.type === template.type);
  return {
    type: template.type,
    description: template.description || template.name,
    amount: template.amount ? String(template.amount) : '',
    categoryId: category?.id || '',
    accountId: account?.id || '',
  };
}

// Movimiento listo para registrar de un toque (solo si la plantilla trae monto, categoría y una cuenta visible).
export function templateToTransaction(template, { accounts, categories, memberId, date }) {
  const f = templateToForm(template, { accounts, categories });
  if (!template.amount || !f.categoryId || !f.accountId) return null;
  return {
    type: template.type, description: f.description, amount: template.amount, categoryId: f.categoryId, accountId: f.accountId,
    memberId, date, recurring: false, frequency: null, isShared: false, participants: null, nature: null,
  };
}

export const canQuickRegister = (template, ctx) => templateToTransaction(template, { ...ctx, memberId: 'x', date: '2000-01-01' }) !== null;

// Las más usadas no se pueden saber sin contadores: se ordenan por nombre, las de un solo toque primero.
export function sortTemplates(templates, ctx) {
  return [...templates].sort((a, b) => Number(canQuickRegister(b, ctx)) - Number(canQuickRegister(a, ctx)) || a.name.localeCompare(b.name, 'es'));
}
