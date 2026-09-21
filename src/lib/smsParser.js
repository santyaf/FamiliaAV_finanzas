// Lee un SMS o correo del banco (o de Nequi, Daviplata…) y saca el movimiento: tipo, monto, comercio y fecha.
// Sin IA y sin red: reglas para los formatos colombianos más comunes. Si duda, devuelve menos campos
// (nunca inventa): la persona siempre revisa el formulario antes de guardar.
import { parseAmount } from './statementImport';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');

const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };

// El primer monto con $ o COP; si no hay símbolo, el primer número con formato de dinero (miles con punto o coma).
export function findAmount(text) {
  const withSymbol = text.match(/(?:\$|COP\s?|cop\s?)\s?([\d]{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (withSymbol) return parseAmount(withSymbol[1]);
  const plain = text.match(/\b(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?)\b/);
  return plain ? parseAmount(plain[1]) : null;
}

export function findDate(text, todayISO) {
  const year = Number(todayISO.slice(0, 4));
  let m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = text.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = Number(m[1]); const mo = Number(m[2]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = norm(text).match(/\b(\d{1,2})\s*(?:de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)[a-z]*\.?(?:\s*(?:de\s+)?(\d{4}))?/);
  if (m) return `${m[3] ? Number(m[3]) : year}-${pad(MONTHS[m[2]])}-${pad(Number(m[1]))}`;
  return null;
}

const INCOME_WORDS = /\b(recibiste|te llegaron|te consignaron|consignacion|abono|deposito|depositaron|te transfirieron|transferencia recibida|te enviaron|nomina|pago recibido|ingreso|acreditamos|acreditado)\b/;
const EXPENSE_WORDS = /\b(compra|compraste|pagaste|pago|retiro|retiraste|debito|debitamos|cargo|transferiste|transferencia enviada|enviaste|realizaste|avance|cobro|cuota|suscripcion)\b/;

export function findType(text) {
  const t = norm(text);
  const income = INCOME_WORDS.test(t); const expense = EXPENSE_WORDS.test(t);
  if (income && !expense) return 'income';
  if (expense && !income) return 'expense';
  if (income && expense) {
    // "transferencia recibida ... pago": gana lo que aparece primero
    return t.search(INCOME_WORDS) < t.search(EXPENSE_WORDS) ? 'income' : 'expense';
  }
  return null;
}

// Comercio o persona: lo que sigue a "en", "de" (ingresos), "a" o "comercio:" hasta el siguiente conector.
export function findMerchant(text, type) {
  const clean = text.replace(/\s+/g, ' ');
  const stop = '(?=\\s+(?:con|el|a las|a la|desde|por|usando|tarjeta|t\\.|\\*|ref|saldo|si no|hora|fecha|aprobad|en tu|en su|en la|en el)|[.,;\\n]|\\s*$|\\s+\\d{1,2}[/\\-])';
  const patterns = type === 'income'
    ? [new RegExp(`(?:de|desde)\\s+([A-ZÁÉÍÓÚÑ][\\wÁÉÍÓÚÑáéíóúñ&.\\- ]{2,40}?)${stop}`), new RegExp(`por concepto de\\s+([\\wÁÉÍÓÚÑáéíóúñ ]{3,40}?)${stop}`, 'i')]
    : [new RegExp(`\\ben\\s+([A-ZÁÉÍÓÚÑ0-9][\\wÁÉÍÓÚÑáéíóúñ&.*\\- ]{2,40}?)${stop}`), new RegExp(`comercio[:\\s]+([\\wÁÉÍÓÚÑáéíóúñ&.*\\- ]{3,40}?)${stop}`, 'i'), new RegExp(`\\ba\\s+([A-ZÁÉÍÓÚÑ][\\wÁÉÍÓÚÑáéíóúñ&.\\- ]{2,40}?)${stop}`)];
  for (const re of patterns) {
    const m = clean.match(re);
    if (m) { const name = m[1].trim().replace(/[.\-*\s]+$/, ''); if (name.length >= 3 && !/^(tu|su|la|el|un|una|cuenta|tarjeta)\b/i.test(name)) return name; }
  }
  if (/cajero/i.test(clean) && type === 'expense') return 'Retiro en cajero';
  return null;
}

// → { type, amount, description, date, found: ['tipo', 'monto', ...] } — campos que no se pudieron leer quedan null.
export function parseBankMessage(text, { todayISO }) {
  const raw = String(text || '').trim();
  if (!raw) return { type: null, amount: null, description: null, date: null, found: [] };
  const amount = findAmount(raw);
  const type = findType(raw) || (amount ? 'expense' : null);
  const description = findMerchant(raw, type || 'expense');
  const date = findDate(raw, todayISO);
  const found = [type && 'tipo', amount && 'monto', description && 'comercio', date && 'fecha'].filter(Boolean);
  return { type, amount, description, date, found };
}
