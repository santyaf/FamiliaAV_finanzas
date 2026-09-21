// Exportar "mis datos" — lógica pura. Solo incluye lo que esta persona ya puede ver
// (los datos llegan filtrados por las políticas RLS de la base).

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function buildUserExport({ data, userId, exportedAt }) {
  const me = data.members.find((m) => m.id === userId);
  return {
    formato: 'finanzas-hogar-export',
    version: 1,
    exportado_el: exportedAt,
    hogar: { nombre: data.householdName, moneda: data.currency },
    yo: { id: userId, nombre: me?.name || null },
    integrantes: data.members.map((m) => ({ id: m.id, nombre: m.name, rol: m.role || null })),
    cuentas: data.accounts,
    categorias: data.categories.map((c) => ({ id: c.id, nombre: c.name, tipo: c.type, rubro: c.groupName || null, naturaleza: c.nature || null, fijo: !!c.isFixed })),
    movimientos: data.transactions,
    objetivos: data.goals,
    presupuestos: data.budgets,
    obligaciones: data.obligations || [],
    creditos: (data.creditsWithPayments || []).map(({ credit, payments }) => ({ ...credit, cuotas: payments })),
    compras_diferidas_tarjeta: data.cardPlans || [],
  };
}

export const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV de movimientos para Excel en español (separador ";" y coma decimal).
export function transactionsToCsv(data) {
  const nameOf = (list, id) => list.find((x) => x.id === id)?.name || '';
  const head = ['Fecha', 'Tipo', 'Descripción', 'Monto', 'Categoría', 'Cuenta', 'Integrante', 'Compartido', 'Recurrente'];
  const rows = [...data.transactions]
    .filter((t) => t.type === 'income' || t.type === 'expense' || t.type === 'transfer')
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map((t) => [
      t.date, t.type === 'income' ? 'Ingreso' : t.type === 'expense' ? 'Gasto' : 'Transferencia', t.description || '',
      String(round2(t.amount)).replace('.', ','), nameOf(data.categories, t.categoryId), nameOf(data.accounts, t.accountId),
      nameOf(data.members, t.memberId), t.isShared ? 'Sí' : 'No', t.recurring ? 'Sí' : 'No',
    ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function exportFileName(prefix, dateISO, ext) {
  return `${prefix}-${dateISO}.${ext}`;
}
