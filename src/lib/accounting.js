// Naturaleza contable de los movimientos (Fase 17) — base de los estados
// financieros. Lógica pura y constantes compartidas entre la base de datos
// (categorías por defecto), las pantallas y los informes.
//
// - Operativo: ingresos y gastos del día a día (sueldo, mercado, arriendo, intereses…).
// - Financiamiento: préstamos recibidos y capital de deudas pagado. Pagar el
//   capital de una deuda NO es un gasto: baja un pasivo.
// - Inversión: compra/venta de activos y ahorro invertido.
// - Apertura: el saldo inicial de una cuenta (no es un ingreso del período).

export const NATURES = [
  { id: 'operativo', label: 'Operativo', hint: 'Ingresos y gastos del día a día' },
  { id: 'financiamiento', label: 'Financiamiento', hint: 'Préstamos recibidos y capital de deudas pagado' },
  { id: 'inversion', label: 'Inversión', hint: 'Compra o venta de activos, ahorro invertido' },
];
export const TRANSACTION_NATURES = [...NATURES, { id: 'apertura', label: 'Saldo inicial', hint: 'Saldo con el que arrancó una cuenta' }];

export function natureLabel(id) {
  return TRANSACTION_NATURES.find((n) => n.id === id)?.label || id;
}

// La naturaleza de un movimiento: la suya si la tiene, si no la de su categoría.
export function effectiveNature(transaction, category) {
  return transaction?.nature || category?.nature || 'operativo';
}

// Categorías que se crean en un hogar nuevo — con su rubro (para agrupar en
// los informes), su naturaleza y si es un gasto fijo. Debe coincidir con lo
// que la migración fase17_naturaleza_contable le puso a los hogares existentes.
export const DEFAULT_CATEGORY_SPECS = [
  { name: 'Salario', type: 'income', icon: 'briefcase', group: 'Ingresos laborales', nature: 'operativo', fixed: false },
  { name: 'Negocio / Freelance', type: 'income', icon: 'receipt', group: 'Ingresos laborales', nature: 'operativo', fixed: false },
  { name: 'Rentas', type: 'income', icon: 'home', group: 'Ingresos por activos', nature: 'operativo', fixed: false },
  { name: 'Inversiones', type: 'income', icon: 'trending-up', group: 'Ingresos por activos', nature: 'operativo', fixed: false },
  { name: 'Otros ingresos', type: 'income', icon: 'plus', group: 'Otros ingresos', nature: 'operativo', fixed: false },
  { name: 'Préstamos recibidos', type: 'income', icon: 'plus', group: 'Financiamiento', nature: 'financiamiento', fixed: false },
  { name: 'Vivienda', type: 'expense', icon: 'home', group: 'Vivienda y servicios', nature: 'operativo', fixed: true },
  { name: 'Servicios (luz/agua/internet)', type: 'expense', icon: 'lightbulb', group: 'Vivienda y servicios', nature: 'operativo', fixed: false },
  { name: 'Alimentación', type: 'expense', icon: 'utensils', group: 'Alimentación', nature: 'operativo', fixed: false },
  { name: 'Transporte', type: 'expense', icon: 'car', group: 'Transporte', nature: 'operativo', fixed: false },
  { name: 'Salud', type: 'expense', icon: 'heart-pulse', group: 'Salud', nature: 'operativo', fixed: false },
  { name: 'Educación', type: 'expense', icon: 'graduation-cap', group: 'Educación', nature: 'operativo', fixed: true },
  { name: 'Ocio y entretenimiento', type: 'expense', icon: 'film', group: 'Estilo de vida', nature: 'operativo', fixed: false },
  { name: 'Ropa', type: 'expense', icon: 'shirt', group: 'Estilo de vida', nature: 'operativo', fixed: false },
  { name: 'Intereses y comisiones', type: 'expense', icon: 'credit-card', group: 'Costos financieros', nature: 'operativo', fixed: false },
  { name: 'Deudas y préstamos', type: 'expense', icon: 'credit-card', group: 'Deudas', nature: 'financiamiento', fixed: true },
  { name: 'Ahorro / Inversión', type: 'expense', icon: 'piggy-bank', group: 'Ahorro e inversión', nature: 'inversion', fixed: false },
  { name: 'Otros gastos', type: 'expense', icon: 'minus', group: 'Otros', nature: 'operativo', fixed: false },
];

// Nombres de las dos categorías que el sistema usa por su cuenta al pagar una
// cuota de crédito (intereses) y al registrar el desembolso de un préstamo.
export const INTEREST_CATEGORY = DEFAULT_CATEGORY_SPECS.find((c) => c.name === 'Intereses y comisiones');
export const LOAN_INCOME_CATEGORY = DEFAULT_CATEGORY_SPECS.find((c) => c.name === 'Préstamos recibidos');

// Al pagar una cuota de crédito: el capital baja el pasivo (financiamiento) y
// solo intereses + seguro son gasto. Devuelve los montos de cada movimiento
// (0 = no hace falta crearlo).
export function splitInstallment({ capital = 0, interest = 0, insurance = 0 }) {
  const round = (n) => Math.round(n * 100) / 100;
  return { capital: round(capital), cost: round(interest + insurance) };
}
