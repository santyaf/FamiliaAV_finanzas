// Formateo de moneda y fecha — puro, sin dependencias de React/DOM.

export function formatMoney(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0);
  } catch {
    return `$${Math.round(amount || 0).toLocaleString('es-ES')}`;
  }
}

export function formatDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
