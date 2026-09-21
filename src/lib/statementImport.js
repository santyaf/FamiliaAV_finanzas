// Importar extractos bancarios (CSV / pegado desde Excel) — lógica pura, sin red ni React.
// Flujo: decodificar → separar en filas → detectar columnas → interpretar fechas y montos →
// sugerir categorías (con lo que ya se registró) → marcar duplicados contra lo existente.

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------ lectura ------------------------------ */

// Bytes → texto. Los CSV de bancos colombianos vienen a veces en Windows-1252: si UTF-8 falla, se usa ese.
export function decodeText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 15);
  const candidates = [';', '\t', ',', '|'];
  let best = ','; let bestScore = -1;
  candidates.forEach((d) => {
    const counts = lines.map((l) => l.split(d).length - 1);
    const nonZero = counts.filter((c) => c > 0);
    if (!nonZero.length) return;
    const consistent = nonZero.filter((c) => c === nonZero[0]).length;
    const score = consistent * 100 + nonZero[0];
    if (score > bestScore) { bestScore = score; best = d; }
  });
  return best;
}

// CSV con comillas (RFC 4180): "a;b" dentro de comillas no separa; "" es una comilla.
export function parseDelimited(text, delimiter) {
  const rows = []; let row = []; let cell = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false; }
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

/* ------------------------------ columnas ------------------------------ */

const looksLikeDate = (s) => /^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}/.test(String(s).trim());
const looksLikeNumber = (s) => /^[-+(]?\s*\$?\s*[\d.,]+\s*\)?-?$/.test(String(s).trim()) && /\d/.test(s);

// Fila del encabezado: la primera que tiene varias celdas de texto y cuya siguiente fila trae fechas o números.
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length - 1, 25); i++) {
    const cells = rows[i].filter((c) => c !== '');
    const textual = cells.filter((c) => !looksLikeNumber(c) && !looksLikeDate(c));
    const next = rows[i + 1] || [];
    const nextHasData = next.some((c) => looksLikeDate(c)) || next.filter((c) => looksLikeNumber(c)).length >= 1;
    if (textual.length >= 2 && textual.length === cells.length && nextHasData) return i;
  }
  return -1; // sin encabezado: la primera fila ya es un dato
}

const FIELD_HINTS = {
  date: ['fecha', 'date', 'dia'],
  description: ['descripcion', 'detalle', 'concepto', 'description', 'movimiento', 'referencia', 'transaccion', 'beneficiario', 'comercio', 'establecimiento'],
  amount: ['valor', 'monto', 'importe', 'amount', 'cantidad', 'total'],
  debit: ['debito', 'debitos', 'cargo', 'cargos', 'retiro', 'retiros', 'egreso', 'egresos', 'salida', 'gasto', 'debit', 'withdrawal'],
  credit: ['credito', 'creditos', 'abono', 'abonos', 'deposito', 'depositos', 'ingreso', 'ingresos', 'entrada', 'credit', 'deposit'],
  type: ['tipo', 'naturaleza', 'type', 'd/c', 'dc'],
  balance: ['saldo', 'balance'],
};

// { date, description, amount, debit, credit, type, balance } → índice de columna (o -1).
export function detectMapping(headers) {
  const mapping = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, type: -1, balance: -1 };
  const used = new Set();
  const nh = headers.map(norm);
  // orden: primero lo más específico, para que "saldo" no se confunda con "valor"
  ['balance', 'debit', 'credit', 'date', 'type', 'description', 'amount'].forEach((field) => {
    const idx = nh.findIndex((h, i) => !used.has(i) && FIELD_HINTS[field].some((k) => h === k || h.startsWith(`${k} `) || h.endsWith(` ${k}`) || h.includes(k)));
    if (idx >= 0) { mapping[field] = idx; used.add(idx); }
  });
  return mapping;
}

// Sin encabezado: adivinar por el contenido de las primeras filas.
export function guessMappingFromData(rows) {
  const mapping = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, type: -1, balance: -1 };
  const width = Math.max(...rows.slice(0, 10).map((r) => r.length));
  const sample = rows.slice(0, 10);
  const colStats = Array.from({ length: width }, (_, i) => {
    const vals = sample.map((r) => r[i] || '').filter((v) => v !== '');
    return { i, dates: vals.filter(looksLikeDate).length, nums: vals.filter((v) => looksLikeNumber(v) && !looksLikeDate(v)).length, texts: vals.filter((v) => !looksLikeNumber(v) && !looksLikeDate(v)).length, avgLen: vals.length ? vals.reduce((s, v) => s + v.length, 0) / vals.length : 0 };
  });
  mapping.date = colStats.find((c) => c.dates >= Math.ceil(sample.length / 2))?.i ?? -1;
  const text = colStats.filter((c) => c.texts >= Math.ceil(sample.length / 2)).sort((a, b) => b.avgLen - a.avgLen)[0];
  mapping.description = text ? text.i : -1;
  const nums = colStats.filter((c) => c.nums >= Math.ceil(sample.length / 2));
  if (nums.length) mapping.amount = nums[0].i;
  if (nums.length > 1) mapping.balance = nums[nums.length - 1].i;
  return mapping;
}

/* ------------------------------ montos y fechas ------------------------------ */

// Interpreta "1.234,56", "1,234.56", "-$ 45.000", "(1.200)", "500-" y "12.50".
// decimal: ',' | '.' | 'auto' (auto: el último separador que aparece es el decimal;
// un solo separador seguido de exactamente 3 dígitos se lee como de miles).
export function parseAmount(raw, decimal = 'auto') {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { negative = true; s = s.replace(/-\s*$/, ''); }
  if (/^\s*-/.test(s)) { negative = true; s = s.replace(/^\s*-/, ''); }
  if (/^\s*\+/.test(s)) s = s.replace(/^\s*\+/, '');
  s = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;

  let sep = decimal;
  if (decimal === 'auto') {
    const lastDot = s.lastIndexOf('.'); const lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) sep = lastDot > lastComma ? '.' : ',';
    else if (lastComma >= 0) {
      const many = (s.match(/,/g) || []).length > 1;
      sep = !many && /,\d{1,2}$/.test(s) ? ',' : (/,\d{3}$/.test(s) ? '' : ',');
    } else if (lastDot >= 0) {
      const many = (s.match(/\./g) || []).length > 1;
      sep = !many && /\.\d{1,2}$/.test(s) ? '.' : (/\.\d{3}$/.test(s) ? '' : '.');
    } else sep = '';
  }
  let intPart = s; let decPart = '';
  if (sep) {
    const idx = s.lastIndexOf(sep);
    if (idx >= 0) { intPart = s.slice(0, idx); decPart = s.slice(idx + 1); }
  }
  intPart = intPart.replace(/[.,]/g, '');
  const value = Number(`${intPart || '0'}${decPart ? `.${decPart.replace(/[.,]/g, '')}` : ''}`);
  if (!Number.isFinite(value)) return null;
  return round2(negative ? -value : value);
}

const pad = (n) => String(n).padStart(2, '0');

// 'dmy' | 'mdy' | 'ymd' según lo que muestren las fechas de la columna. Por defecto dmy (Colombia).
export function detectDateFormat(values) {
  let dmy = 0; let mdy = 0; let ymd = 0;
  values.forEach((v) => {
    const m = String(v).trim().match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/);
    if (!m) return;
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[1].length === 4) { ymd++; return; }
    if (a > 12) dmy++;
    else if (b > 12) mdy++;
    if (c > 31 || m[3].length === 4) { /* año al final */ }
  });
  if (ymd > 0 && ymd >= dmy && ymd >= mdy) return 'ymd';
  if (mdy > dmy) return 'mdy';
  return 'dmy';
}

// Devuelve 'AAAA-MM-DD' o null.
export function parseDate(raw, format = 'dmy') {
  const m = String(raw ?? '').trim().match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/);
  if (!m) return null;
  let y; let mo; let d;
  if (format === 'ymd' || m[1].length === 4) { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); }
  else if (format === 'mdy') { mo = Number(m[1]); d = Number(m[2]); y = Number(m[3]); }
  else { d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]); }
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > last) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/* ------------------------------ filas a movimientos ------------------------------ */

const DEBIT_WORDS = ['d', 'db', 'debito', 'cargo', 'retiro', 'egreso', 'salida', 'compra', 'pago', 'gasto'];
const CREDIT_WORDS = ['c', 'cr', 'credito', 'abono', 'deposito', 'ingreso', 'entrada', 'consignacion', 'recarga'];

// options: { mapping, dateFormat, decimal, invertSign, hasHeader }
// Devuelve [{ line, date, description, amount (positivo), type, error }].
export function buildImportRows(rows, { mapping, dateFormat = 'dmy', decimal = 'auto', invertSign = false }) {
  return rows.map((cells, i) => {
    const line = i + 1;
    const get = (idx) => (idx >= 0 ? (cells[idx] ?? '') : '');
    const date = parseDate(get(mapping.date), dateFormat);
    const description = get(mapping.description).replace(/\s+/g, ' ').trim();
    let amount = null; let type = null;

    if (mapping.debit >= 0 || mapping.credit >= 0) {
      const debit = parseAmount(get(mapping.debit), decimal);
      const credit = parseAmount(get(mapping.credit), decimal);
      if (debit && Math.abs(debit) > 0) { amount = Math.abs(debit); type = 'expense'; }
      else if (credit && Math.abs(credit) > 0) { amount = Math.abs(credit); type = 'income'; }
    } else if (mapping.amount >= 0) {
      const value = parseAmount(get(mapping.amount), decimal);
      if (value !== null && value !== 0) {
        amount = Math.abs(value);
        type = value < 0 ? 'expense' : 'income';
        if (mapping.type >= 0) {
          const t = norm(get(mapping.type));
          if (DEBIT_WORDS.includes(t)) type = 'expense';
          else if (CREDIT_WORDS.includes(t)) type = 'income';
        }
      }
    }
    if (type && invertSign) type = type === 'expense' ? 'income' : 'expense';

    let error = null;
    if (!date) error = 'Fecha no válida';
    else if (amount === null) error = 'Monto no válido o en cero';
    return { line, date, description, amount, type, error };
  });
}

/* ------------------------------ categorías y duplicados ------------------------------ */

export function normalizeDescription(s) {
  return norm(s).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
const tokens = (s) => normalizeDescription(s).split(' ').filter((t) => t.length >= 3);

// Sugiere categoría con lo que la persona ya registró: misma descripción, o la que comparte más palabras.
export function suggestCategories(importRows, existing, categories) {
  const byDesc = new Map(); // descripción normalizada → { categoryId: veces }
  const byToken = new Map(); // palabra → { categoryId: veces }
  const bump = (map, key, catId) => { const m = map.get(key) || {}; m[catId] = (m[catId] || 0) + 1; map.set(key, m); };
  existing.forEach((t) => {
    if ((t.type !== 'income' && t.type !== 'expense') || !t.categoryId || !t.description) return;
    const d = normalizeDescription(t.description);
    if (d) bump(byDesc, `${t.type}|${d}`, t.categoryId);
    tokens(t.description).forEach((tok) => bump(byToken, `${t.type}|${tok}`, t.categoryId));
  });
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1])[0][0];
  const fallback = (type) => categories.find((c) => c.type === type && /otro/i.test(c.name))?.id || categories.find((c) => c.type === type)?.id || null;
  const valid = new Set(categories.map((c) => c.id));

  return importRows.map((r) => {
    if (!r.type) return { ...r, categoryId: null, suggested: false };
    const exact = byDesc.get(`${r.type}|${normalizeDescription(r.description)}`);
    if (exact) { const id = top(exact); if (valid.has(id)) return { ...r, categoryId: id, suggested: true }; }
    const votes = {};
    tokens(r.description).forEach((tok) => {
      const m = byToken.get(`${r.type}|${tok}`);
      if (m) Object.entries(m).forEach(([id, n]) => { votes[id] = (votes[id] || 0) + n; });
    });
    const best = Object.entries(votes).filter(([id]) => valid.has(id)).sort((a, b) => b[1] - a[1])[0];
    if (best) return { ...r, categoryId: best[0], suggested: true };
    return { ...r, categoryId: fallback(r.type), suggested: false };
  });
}

// Marca como duplicado lo que ya existe en la misma cuenta: misma fecha, tipo y monto, y una
// descripción parecida (o una de las dos vacía). Cada movimiento existente cubre UNA fila, así
// dos cafés iguales en un día solo se descartan si ya estaban los dos.
export function markDuplicates(importRows, existing, accountId) {
  const pool = existing.filter((t) => t.accountId === accountId && (t.type === 'income' || t.type === 'expense'))
    .map((t) => ({ date: t.date, type: t.type, amount: round2(t.amount), tokens: tokens(t.description || ''), used: false }));
  return importRows.map((r) => {
    if (r.error || !r.type) return { ...r, duplicate: false };
    const rt = tokens(r.description);
    const hit = pool.find((p) => !p.used && p.date === r.date && p.type === r.type && p.amount === round2(r.amount)
      && (p.tokens.length === 0 || rt.length === 0 || p.tokens.some((t) => rt.includes(t))));
    if (hit) { hit.used = true; return { ...r, duplicate: true }; }
    return { ...r, duplicate: false };
  });
}

export function summarizeImport(rows) {
  const chosen = rows.filter((r) => r.include && !r.error);
  const sum = (type) => round2(chosen.filter((r) => r.type === type).reduce((s, r) => s + r.amount, 0));
  return {
    total: rows.length,
    selected: chosen.length,
    invalid: rows.filter((r) => r.error).length,
    duplicates: rows.filter((r) => r.duplicate).length,
    income: sum('income'),
    expense: sum('expense'),
  };
}
