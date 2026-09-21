// Primeros pasos guiados — lógica pura. Cada paso se marca solo cuando los datos ya lo cumplen.
export function onboardingSteps(data) {
  const has = (list) => (list || []).length > 0;
  const manual = (data.transactions || []).filter((t) => t.type === 'income' || t.type === 'expense');
  return [
    { id: 'cuenta', title: 'Crea tu primera cuenta', hint: 'Donde tienes tu dinero: ahorros, efectivo, tarjeta.', done: has(data.accounts), cta: { label: 'Crear cuenta', modal: 'account' } },
    { id: 'movimiento', title: 'Registra tu primer movimiento', hint: 'Un gasto o un ingreso. También puedes escribirle al asistente o pegar el SMS del banco.', done: manual.length > 0, cta: { label: 'Registrar', modal: 'transaction' } },
    { id: 'presupuesto', title: 'Ponle un límite a una categoría', hint: 'Un presupuesto te avisa antes de pasarte.', done: has(data.budgets), cta: { label: 'Crear presupuesto', tab: 'presupuestos' } },
    { id: 'objetivo', title: 'Crea una meta de ahorro', hint: 'Un viaje, un fondo de emergencia, lo que quieran lograr.', done: has(data.goals), cta: { label: 'Crear meta', tab: 'objetivos' } },
    { id: 'familia', title: 'Invita a tu familia', hint: 'Compartan cuentas y gastos; cada quien conserva lo privado.', done: (data.members || []).length > 1, cta: { label: 'Invitar', modal: 'invite' } },
  ];
}

export function onboardingProgress(steps) {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, pct: Math.round((done / steps.length) * 100), complete: done === steps.length, next: steps.find((s) => !s.done) || null };
}
