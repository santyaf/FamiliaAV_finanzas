import { describe, it, expect } from 'vitest';
import {
  decodeText, detectDelimiter, parseDelimited, findHeaderRow, detectMapping, guessMappingFromData, parseAmount,
  detectDateFormat, parseDate, buildImportRows, normalizeDescription, suggestCategories, markDuplicates, summarizeImport,
} from './statementImport';

const MAP = { date: 0, description: 1, amount: 2, debit: -1, credit: -1, type: -1, balance: -1 };

describe('decodeText', () => {
  it('lee UTF-8 y quita el BOM', () => {
    const bytes = new TextEncoder().encode('﻿Descripción;Valor');
    expect(decodeText(bytes)).toBe('Descripción;Valor');
  });
  it('si no es UTF-8 válido, usa Windows-1252 (acentos de bancos viejos)', () => {
    const bytes = Uint8Array.from([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0x70, 0x63, 0x69, 0xf3, 0x6e]);
    expect(decodeText(bytes)).toBe('Descripción');
  });
});

describe('detectDelimiter / parseDelimited', () => {
  it('detecta ; tab , y |', () => {
    expect(detectDelimiter('Fecha;Detalle;Valor\n01/09/2026;Café;-4500')).toBe(';');
    expect(detectDelimiter('Fecha\tDetalle\tValor\n01/09/2026\tCafé\t-4500')).toBe('\t');
    expect(detectDelimiter('Fecha,Detalle,Valor\n2026-09-01,Café,-4500')).toBe(',');
  });
  it('respeta comillas, separadores dentro de comillas y comillas dobles', () => {
    const rows = parseDelimited('a;"b;c";"d ""x"""\r\n1;2;3\r\n', ';');
    expect(rows).toEqual([['a', 'b;c', 'd "x"'], ['1', '2', '3']]);
  });
  it('ignora líneas vacías y acepta los distintos saltos de línea', () => {
    expect(parseDelimited('a;b\n\n1;2\r3;4', ';')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });
  it('una comilla con salto de línea dentro sigue siendo una sola celda', () => {
    expect(parseDelimited('"a\nb";c', ';')).toEqual([['a\nb', 'c']]);
  });
});

describe('findHeaderRow / detectMapping', () => {
  it('salta el preámbulo del banco y encuentra el encabezado', () => {
    const rows = [['Extracto de cuenta de ahorros'], ['Cliente: Ana'], ['Fecha', 'Descripción', 'Valor', 'Saldo'], ['01/09/2026', 'Café', '-4.500', '95.500']];
    expect(findHeaderRow(rows)).toBe(2);
  });
  it('sin encabezado devuelve -1', () => {
    expect(findHeaderRow([['01/09/2026', 'Café', '-4.500'], ['02/09/2026', 'Bus', '-2.800']])).toBe(-1);
  });
  it('mapea nombres típicos de bancos colombianos', () => {
    expect(detectMapping(['Fecha', 'Descripción', 'Valor', 'Saldo'])).toEqual({ date: 0, description: 1, amount: 2, debit: -1, credit: -1, type: -1, balance: 3 });
    expect(detectMapping(['Fecha de la transacción', 'Detalle', 'Débitos', 'Créditos', 'Saldo disponible'])).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3, balance: 4, amount: -1 });
    expect(detectMapping(['Date', 'Concepto', 'Importe', 'Tipo'])).toMatchObject({ date: 0, description: 1, amount: 2, type: 3 });
  });
  it('el saldo no se confunde con el valor', () => {
    const m = detectMapping(['Fecha', 'Concepto', 'Saldo', 'Valor']);
    expect(m.amount).toBe(3);
    expect(m.balance).toBe(2);
  });
  it('sin encabezado adivina por contenido', () => {
    const m = guessMappingFromData([['01/09/2026', 'Compra en Éxito', '-45.000', '955.000'], ['02/09/2026', 'Pago Netflix', '-18.000', '937.000']]);
    expect(m).toMatchObject({ date: 0, description: 1, amount: 2, balance: 3 });
  });
});

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['45.000', 45000], ['12.50', 12.5], ['1,5', 1.5], ['1,234', 1234],
    ['1.234.567', 1234567], ['-$ 45.000', -45000], ['$45.000', 45000], ['(1.200)', -1200], ['500-', -500], ['+300', 300], ['0', 0], ['3.000.000,50', 3000000.5],
  ])('%s → %s', (raw, expected) => expect(parseAmount(raw)).toBe(expected));
  it('vacío o sin dígitos es null', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
  it('se puede forzar el separador decimal', () => {
    expect(parseAmount('1.234', ',')).toBe(1234);
    expect(parseAmount('1.25', '.')).toBe(1.25);
    expect(parseAmount('1.25', ',')).toBe(125);
    expect(parseAmount('1234', ',')).toBe(1234);
  });
});

describe('fechas', () => {
  it('detecta el formato con fechas no ambiguas', () => {
    expect(detectDateFormat(['25/09/2026', '01/09/2026'])).toBe('dmy');
    expect(detectDateFormat(['09/25/2026', '09/01/2026'])).toBe('mdy');
    expect(detectDateFormat(['2026-09-25', '2026-09-01'])).toBe('ymd');
    expect(detectDateFormat(['01/02/2026'])).toBe('dmy');
  });
  it('parsea a AAAA-MM-DD', () => {
    expect(parseDate('25/09/2026', 'dmy')).toBe('2026-09-25');
    expect(parseDate('09/25/2026', 'mdy')).toBe('2026-09-25');
    expect(parseDate('2026-09-05', 'dmy')).toBe('2026-09-05');
    expect(parseDate('5-9-26', 'dmy')).toBe('2026-09-05');
    expect(parseDate('01.02.2026 10:32', 'dmy')).toBe('2026-02-01');
  });
  it('rechaza fechas imposibles', () => {
    expect(parseDate('31/02/2026', 'dmy')).toBeNull();
    expect(parseDate('13/13/2026', 'dmy')).toBeNull();
    expect(parseDate('hola', 'dmy')).toBeNull();
    expect(parseDate('', 'dmy')).toBeNull();
  });
});

describe('buildImportRows', () => {
  it('una columna de valor con signo: negativo es gasto, positivo ingreso', () => {
    const out = buildImportRows([['01/09/2026', 'Café', '-4.500'], ['02/09/2026', 'Sueldo', '3.000.000']], { mapping: MAP });
    expect(out[0]).toMatchObject({ date: '2026-09-01', description: 'Café', amount: 4500, type: 'expense', error: null });
    expect(out[1]).toMatchObject({ amount: 3000000, type: 'income' });
  });
  it('columnas de débito y crédito', () => {
    const out = buildImportRows([['01/09/2026', 'Retiro', '20.000', ''], ['02/09/2026', 'Abono', '', '50.000']], { mapping: { ...MAP, amount: -1, debit: 2, credit: 3 } });
    expect(out.map((r) => [r.type, r.amount])).toEqual([['expense', 20000], ['income', 50000]]);
  });
  it('columna de tipo (D/C, débito/crédito) manda sobre el signo', () => {
    const out = buildImportRows([['01/09/2026', 'A', '1.000', 'D'], ['01/09/2026', 'B', '1.000', 'Crédito']], { mapping: { ...MAP, type: 3 } });
    expect(out.map((r) => r.type)).toEqual(['expense', 'income']);
  });
  it('invertir el signo (extractos de tarjeta que listan las compras en positivo)', () => {
    const out = buildImportRows([['01/09/2026', 'Compra', '45.000']], { mapping: MAP, invertSign: true });
    expect(out[0].type).toBe('expense');
  });
  it('marca las filas con fecha o monto inválidos, con su número de línea', () => {
    const out = buildImportRows([['fecha rara', 'X', '100'], ['01/09/2026', 'Y', ''], ['01/09/2026', 'Z', '0']], { mapping: MAP });
    expect(out.map((r) => r.error)).toEqual(['Fecha no válida', 'Monto no válido o en cero', 'Monto no válido o en cero']);
    expect(out[2].line).toBe(3);
  });
});

describe('suggestCategories', () => {
  const categories = [
    { id: 'super', name: 'Mercado', type: 'expense' }, { id: 'trans', name: 'Transporte', type: 'expense' },
    { id: 'otros', name: 'Otros gastos', type: 'expense' }, { id: 'sal', name: 'Salario', type: 'income' },
  ];
  const existing = [
    { type: 'expense', description: 'Éxito Laureles', categoryId: 'super' },
    { type: 'expense', description: 'Éxito Poblado', categoryId: 'super' },
    { type: 'expense', description: 'Uber viaje', categoryId: 'trans' },
    { type: 'income', description: 'Nómina empresa', categoryId: 'sal' },
  ];
  const rows = [
    { type: 'expense', description: 'EXITO LAURELES' }, { type: 'expense', description: 'Compra Éxito Envigado' },
    { type: 'expense', description: 'UBER *TRIP 1234' }, { type: 'expense', description: 'Algo desconocido' },
    { type: 'income', description: 'Nomina empresa septiembre' }, { type: null, description: 'x' },
  ];
  const out = suggestCategories(rows, existing, categories);
  it('misma descripción → su categoría', () => expect(out[0]).toMatchObject({ categoryId: 'super', suggested: true }));
  it('comparte palabras → la categoría más votada', () => {
    expect(out[1]).toMatchObject({ categoryId: 'super', suggested: true });
    expect(out[2]).toMatchObject({ categoryId: 'trans', suggested: true });
    expect(out[4]).toMatchObject({ categoryId: 'sal', suggested: true });
  });
  it('sin pistas → "Otros" del mismo tipo, sin marcar como sugerida', () => expect(out[3]).toMatchObject({ categoryId: 'otros', suggested: false }));
  it('una fila sin tipo no recibe categoría', () => expect(out[5].categoryId).toBeNull());
  it('ignora categorías que ya no existen', () => {
    const o = suggestCategories([{ type: 'expense', description: 'Éxito' }], [{ type: 'expense', description: 'Éxito', categoryId: 'borrada' }], categories);
    expect(o[0].categoryId).toBe('otros');
  });
});

describe('markDuplicates', () => {
  const existing = [
    { accountId: 'a1', type: 'expense', date: '2026-09-01', amount: 4500, description: 'Café Juan Valdez' },
    { accountId: 'a2', type: 'expense', date: '2026-09-02', amount: 9000, description: 'Otro' },
  ];
  it('misma cuenta, fecha, tipo, monto y descripción parecida = duplicado', () => {
    const out = markDuplicates([{ date: '2026-09-01', type: 'expense', amount: 4500, description: 'JUAN VALDEZ CAFE' }], existing, 'a1');
    expect(out[0].duplicate).toBe(true);
  });
  it('otra cuenta, otra fecha o distinto monto no son duplicados', () => {
    const out = markDuplicates([
      { date: '2026-09-02', type: 'expense', amount: 9000, description: 'Otro' },
      { date: '2026-09-01', type: 'expense', amount: 4501, description: 'Café' },
      { date: '2026-09-03', type: 'expense', amount: 4500, description: 'Café' },
    ], existing, 'a1');
    expect(out.map((r) => r.duplicate)).toEqual([false, false, false]);
  });
  it('cada movimiento existente cubre una sola fila: dos cafés iguales, uno ya registrado', () => {
    const rows = [
      { date: '2026-09-01', type: 'expense', amount: 4500, description: 'Café' },
      { date: '2026-09-01', type: 'expense', amount: 4500, description: 'Café' },
    ];
    const one = [{ accountId: 'a1', type: 'expense', date: '2026-09-01', amount: 4500, description: 'Café' }];
    expect(markDuplicates(rows, one, 'a1').map((r) => r.duplicate)).toEqual([true, false]);
  });
  it('descripciones sin palabras en común no cuentan, salvo que una esté vacía', () => {
    expect(markDuplicates([{ date: '2026-09-01', type: 'expense', amount: 4500, description: 'Gasolina' }], existing, 'a1')[0].duplicate).toBe(false);
    expect(markDuplicates([{ date: '2026-09-01', type: 'expense', amount: 4500, description: '' }], existing, 'a1')[0].duplicate).toBe(true);
  });
  it('las filas con error no se marcan', () => {
    expect(markDuplicates([{ error: 'x', type: null }], existing, 'a1')[0].duplicate).toBe(false);
  });
});

describe('summarizeImport / normalizeDescription', () => {
  it('resume lo seleccionado', () => {
    const s = summarizeImport([
      { include: true, type: 'income', amount: 100 }, { include: true, type: 'expense', amount: 30 },
      { include: false, type: 'expense', amount: 999 }, { include: true, error: 'x', type: null, amount: null }, { include: false, duplicate: true, type: 'expense', amount: 5 },
    ]);
    expect(s).toEqual({ total: 5, selected: 2, invalid: 1, duplicates: 1, income: 100, expense: 30 });
  });
  it('normaliza sin acentos, números ni símbolos', () => expect(normalizeDescription('  ÉXITO *Laureles #123 ')).toBe('exito laureles'));
});
