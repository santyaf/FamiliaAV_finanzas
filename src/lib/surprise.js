// Movimientos «sorpresa»: se ocultan a los demás integrantes hasta una fecha (la base lo hace cumplir con RLS).
// Mientras tanto, el saldo de la cuenta compartida que ven los demás no lo incluye.

export const FOREVER = '9999-12-31';

export const isHiddenNow = (tx, todayISO) => !!tx?.privateUntil && tx.privateUntil > todayISO;

// Solo tiene sentido dentro de una cuenta compartida (lo individual ya es privado) y con más de una persona.
export const canHide = ({ type, account, membersCount }) => (type === 'expense' || type === 'income') && account?.type === 'shared' && membersCount > 1;

// Valor a guardar: null si no se oculta; la fecha elegida, o «siempre» si se deja vacía.
export function privateUntilValue(hide, untilISO) {
  if (!hide) return null;
  return untilISO || FOREVER;
}

export function validateHideUntil(untilISO, todayISO) {
  if (!untilISO) return '';
  return untilISO > todayISO ? '' : 'Elige una fecha futura para mostrarlo, o déjala vacía para ocultarlo siempre.';
}

export function hiddenLabel(privateUntil, formatDate) {
  if (!privateUntil) return '';
  return privateUntil === FOREVER ? 'Oculto a los demás' : `Oculto hasta el ${formatDate(privateUntil)}`;
}
