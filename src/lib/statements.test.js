import { describe, it, expect } from 'vitest';
import {
  periodRange, periodContaining, previousPeriod, recentPeriods, accountsInScope, accountDelta,
  buildIncomeStatement, buildCashFlow, incomeStatementRows, cashFlowRows, rowsToCsv, statementToHtml,
} from './statements';
import { accountBalance } from './finance';

const ME = 'm1';
const categories = [
  { id: 'sal', name: 'Salario', type: 'income', groupName: 'Ingresos laborales', nature: 'operativo' },
  { id: 'prest', name: 'Préstamos recibidos', type: 'income', groupName: 'Financiamiento', nature: 'financiamiento' },
  { id: 'viv', name: 'Vivienda', type: 'expense', groupName: 'Vivienda y servicios', nature: 'operativo', isFixed: true },
  { id: 'ser', name: 'Servicios', type: 'expense', groupName: 'Vivienda y servicios', nature: 'operativo' },
  { id: 'ali', name: 'Alimentación', type: 'expense', groupName: 'Alimentación', nature: 'operativo' },
  { id: 'deu', name: 'Deudas y préstamos', type: 'expense', groupName: 'Deudas', nature: 'financiamiento' },
  { id: 'int', name: 'Intereses y comisiones', type: 'expense', groupName: 'Costos financieros', nature: 'operativo' },
  { id: 'aho', name: 'Ahorro / Inversión', type: 'expense', groupName: 'Ahorro e inversión', nature: 'inversion' },
  { id: 'suelta', name: 'Suelta', type: 'expense', nature: 'operativo' }, // sin rubro
];
const accounts = [
  { id: 'a1', name: 'Mi cuenta', type: 'individual', ownerIds: [ME] },
  { id: 'a2', name: 'Compartida', type: 'shared', ownerIds: [ME, 'm2'] },
  { id: 'a3', name: 'Cuenta de m2', type: 'individual', ownerIds: ['m2'] },
];
let n = 0;
const tx = (o) => ({ id: `t${++n}`, type: 'expense', amount: 0, categoryId: 'ali', accountId: 'a1', memberId: ME, date: '2026-09-10', recurring: false, ...o });
const Q3 = periodRange('trimestre', 2026, 8);
const SEP = periodRange('mes', 2026, 8);
const personal = { kind: 'personal', memberId: ME };
const hogar = { kind: 'hogar' };
const args = (transactions, range = SEP, scope = personal) => ({ transactions, categories, accounts, range, scope });

describe('periodRange', () => {
  it('mes, con fin de mes correcto (incluye febrero)', () => {
    expect(periodRange('mes', 2026, 8)).toMatchObject({ start: '2026-09-01', end: '2026-09-30', label: 'Septiembre 2026', monthKeys: ['2026-09'] });
    expect(periodRange('mes', 2026, 1).end).toBe('2026-02-28');
    expect(periodRange('mes', 2028, 1).end).toBe('2028-02-29');
  });
  it('trimestre, semestre y año', () => {
    expect(periodRange('trimestre', 2026, 8)).toMatchObject({ start: '2026-07-01', end: '2026-09-30', label: 'T3 2026', monthKeys: ['2026-07', '2026-08', '2026-09'] });
    expect(periodRange('semestre', 2026, 8)).toMatchObject({ start: '2026-07-01', end: '2026-12-31', label: 'S2 2026' });
    expect(periodRange('anio', 2026, 8)).toMatchObject({ start: '2026-01-01', end: '2026-12-31', label: '2026' });
    expect(periodRange('anio', 2026, 8).monthKeys).toHaveLength(12);
  });
  it('periodContaining ubica la fecha en su período', () => {
    expect(periodContaining('trimestre', '2026-05-20')).toMatchObject({ start: '2026-04-01', label: 'T2 2026' });
    expect(periodContaining('semestre', '2026-06-30').label).toBe('S1 2026');
  });
});

describe('previousPeriod / recentPeriods', () => {
  it('retrocede un período y cruza el cambio de año', () => {
    expect(previousPeriod(periodRange('mes', 2026, 0))).toMatchObject({ label: 'Diciembre 2025', end: '2025-12-31' });
    expect(previousPeriod(periodRange('trimestre', 2026, 0))).toMatchObject({ label: 'T4 2025' });
    expect(previousPeriod(periodRange('semestre', 2026, 0))).toMatchObject({ label: 'S2 2025' });
    expect(previousPeriod(periodRange('anio', 2026, 0)).label).toBe('2025');
  });
  it('recentPeriods lista el actual primero', () => {
    expect(recentPeriods('mes', '2026-09-18', 3).map((p) => p.label)).toEqual(['Septiembre 2026', 'Agosto 2026', 'Julio 2026']);
    expect(recentPeriods('trimestre', '2026-02-01', 2).map((p) => p.label)).toEqual(['T1 2026', 'T4 2025']);
  });
});

describe('accountsInScope', () => {
  it('personal = mis cuentas individuales; hogar = las compartidas', () => {
    expect(accountsInScope(accounts, personal).map((a) => a.id)).toEqual(['a1']);
    expect(accountsInScope(accounts, hogar).map((a) => a.id)).toEqual(['a2']);
    expect(accountsInScope(accounts, { kind: 'personal', memberId: 'm2' }).map((a) => a.id)).toEqual(['a3']);
  });
});

describe('Estado de Resultados', () => {
  it('separa ingresos operativos, préstamos y gastos, con resultado operativo y del período', () => {
    const st = buildIncomeStatement(args([
      tx({ type: 'income', categoryId: 'sal', amount: 3000000 }),
      tx({ type: 'income', categoryId: 'prest', amount: 1000000 }),
      tx({ categoryId: 'viv', amount: 900000 }),
      tx({ categoryId: 'ali', amount: 400000 }),
      tx({ categoryId: 'ser', amount: 100000 }),
    ]));
    expect(st.totals).toMatchObject({
      ingresosOperativos: 3000000, ingresosFinanciamiento: 1000000, totalIngresos: 4000000,
      gastosOperativos: 1400000, gastosFijos: 900000, gastosVariables: 500000,
      resultadoOperativo: 1600000, resultado: 2600000,
    });
    expect(st.ratios.tasaAhorro).toBeCloseTo(53.33, 1);
  });

  it('agrupa por rubro y ordena de mayor a menor', () => {
    const st = buildIncomeStatement(args([
      tx({ categoryId: 'viv', amount: 900000 }), tx({ categoryId: 'ser', amount: 100000 }), tx({ categoryId: 'ali', amount: 300000 }),
    ]));
    const groups = st.gastosOperativos.groups;
    expect(groups.map((g) => g.name)).toEqual(['Vivienda y servicios', 'Alimentación']);
    expect(groups[0]).toMatchObject({ total: 1000000 });
    expect(groups[0].lines.map((l) => l.name)).toEqual(['Vivienda', 'Servicios']);
  });

  it('el capital de deuda, el ahorro y el saldo inicial NO son gasto ni ingreso operativo', () => {
    const st = buildIncomeStatement(args([
      tx({ categoryId: 'deu', amount: 800000 }),
      tx({ categoryId: 'aho', amount: 200000 }),
      tx({ categoryId: 'int', amount: 150000 }),
      tx({ type: 'income', categoryId: 'sal', amount: 500000, nature: 'apertura' }),
    ]));
    expect(st.totals.gastosOperativos).toBe(150000);
    expect(st.totals.totalIngresos).toBe(0);
    expect(st.memo).toMatchObject({ capitalDeuda: 800000, ahorroInversion: 200000 });
  });

  it('la naturaleza del movimiento anula la de su categoría', () => {
    const st = buildIncomeStatement(args([tx({ categoryId: 'ali', amount: 700000, nature: 'financiamiento' })]));
    expect(st.totals.gastosOperativos).toBe(0);
    expect(st.memo.capitalDeuda).toBe(700000);
  });

  it('solo cuenta las cuentas del ámbito y las fechas del período', () => {
    const list = [
      tx({ categoryId: 'ali', amount: 100 }),                                   // mi cuenta, en el período
      tx({ categoryId: 'ali', amount: 200, accountId: 'a2' }),                  // compartida
      tx({ categoryId: 'ali', amount: 400, accountId: 'a3', memberId: 'm2' }),  // de otra persona
      tx({ categoryId: 'ali', amount: 800, date: '2026-08-31' }),               // mes anterior
    ];
    expect(buildIncomeStatement(args(list)).totals.gastosOperativos).toBe(100);
    expect(buildIncomeStatement(args(list, SEP, hogar)).totals.gastosOperativos).toBe(200);
  });

  it('ignora transferencias y liquidaciones', () => {
    const st = buildIncomeStatement(args([
      tx({ type: 'transfer', amount: 999, toAccountId: 'a2' }), tx({ type: 'settlement', amount: 500, accountId: undefined }),
    ]));
    expect(st.totals.totalIngresos).toBe(0);
    expect(st.totals.gastosOperativos).toBe(0);
  });

  it('un gasto compartido pagado desde mi cuenta cuenta solo por mi parte (personal)', () => {
    const shared = tx({ categoryId: 'ali', amount: 100000, isShared: true, participants: [{ memberId: ME, share: 30000 }, { memberId: 'm2', share: 70000 }] });
    expect(buildIncomeStatement(args([shared])).totals.gastosOperativos).toBe(30000);
  });

  it('los recurrentes cuentan una vez por cada mes del período', () => {
    const rent = tx({ categoryId: 'viv', amount: 1000000, recurring: true, frequency: 'mensual', date: '2026-01-05' });
    expect(buildIncomeStatement(args([rent], SEP)).totals.gastosOperativos).toBe(1000000);
    expect(buildIncomeStatement(args([rent], Q3)).totals.gastosOperativos).toBe(3000000);
    const starts = tx({ categoryId: 'viv', amount: 1000000, recurring: true, frequency: 'mensual', date: '2026-08-15' });
    expect(buildIncomeStatement(args([starts], Q3)).totals.gastosOperativos).toBe(2000000); // agosto y septiembre
  });

  it('una categoría sin rubro aparece como "Sin rubro"', () => {
    const st = buildIncomeStatement(args([tx({ categoryId: 'suelta', amount: 50 })]));
    expect(st.gastosOperativos.groups[0].name).toBe('Sin rubro');
  });

  it('sin ingresos operativos no hay tasa de ahorro', () => {
    expect(buildIncomeStatement(args([tx({ amount: 10 })])).ratios.tasaAhorro).toBeNull();
  });
});

describe('filas del Estado de Resultados', () => {
  const list = (amount) => [
    tx({ type: 'income', categoryId: 'sal', amount: 3000000 }), tx({ categoryId: 'ali', amount }), tx({ categoryId: 'deu', amount: 500000 }),
  ];
  it('arma títulos, grupos, líneas, subtotales y totales', () => {
    const rows = incomeStatementRows(buildIncomeStatement(args(list(400000))));
    const labels = rows.map((r) => r.label);
    expect(labels).toContain('INGRESOS OPERATIVOS');
    expect(labels).toContain('Ingresos laborales');
    expect(labels).toContain('RESULTADO DEL PERÍODO');
    expect(labels).not.toContain('INGRESOS POR FINANCIAMIENTO (préstamos recibidos)');
    expect(rows.find((r) => r.label === 'RESULTADO DEL PERÍODO').amount).toBe(2600000);
    expect(rows.find((r) => r.label === 'Pagos a capital de deudas').amount).toBe(500000);
  });
  it('el comparativo trae el período anterior, la variación y su porcentaje', () => {
    const cur = buildIncomeStatement(args(list(600000)));
    const prev = buildIncomeStatement({
      ...args([]), range: periodRange('mes', 2026, 7),
      transactions: [tx({ type: 'income', categoryId: 'sal', amount: 3000000, date: '2026-08-10' }), tx({ categoryId: 'ali', amount: 400000, date: '2026-08-12' })],
    });
    const rows = incomeStatementRows(cur, prev);
    const total = rows.find((r) => r.label === 'Total gastos operativos');
    expect(total).toMatchObject({ amount: 600000, previous: 400000, delta: 200000, pct: 50 });
    const line = rows.find((r) => r.label === 'Alimentación' && r.kind === 'line');
    expect(line).toMatchObject({ amount: 600000, previous: 400000 });
  });
  it('muestra también lo que solo existió en el período anterior', () => {
    const cur = buildIncomeStatement(args([tx({ categoryId: 'ali', amount: 100 })]));
    const prev = buildIncomeStatement({ ...args([tx({ categoryId: 'ser', amount: 70, date: '2026-08-05' })]), range: periodRange('mes', 2026, 7) });
    const rows = incomeStatementRows(cur, prev);
    expect(rows.find((r) => r.label === 'Servicios')).toMatchObject({ amount: 0, previous: 70 });
  });
});

describe('accountDelta', () => {
  it('coincide con el saldo de la pantalla Cuentas para cualquier mezcla de movimientos', () => {
    const list = [
      tx({ type: 'income', amount: 1000, categoryId: 'sal' }), tx({ amount: 250 }),
      tx({ type: 'transfer', amount: 300, goalId: 'g1', transferDirection: 'deposit' }),
      tx({ type: 'transfer', amount: 100, goalId: 'g1', transferDirection: 'withdraw' }),
      tx({ type: 'transfer', amount: 50, accountId: 'a1', toAccountId: 'a2' }),
      tx({ type: 'transfer', amount: 20, accountId: 'a2', toAccountId: 'a1' }),
      tx({ type: 'settlement', amount: 999, accountId: undefined }),
    ];
    ['a1', 'a2', 'a3'].forEach((id) => {
      const viaDelta = list.reduce((s, t) => s + accountDelta(t, id), 0);
      expect(viaDelta).toBe(accountBalance(list, id));
    });
  });
});

describe('Flujo de Efectivo', () => {
  const list = () => [
    tx({ type: 'income', categoryId: 'sal', amount: 2000000, date: '2026-08-01' }),                  // antes del período: saldo inicial
    tx({ type: 'income', categoryId: 'sal', amount: 3000000, date: '2026-09-05' }),
    tx({ type: 'income', categoryId: 'prest', amount: 1000000, date: '2026-09-06' }),
    tx({ categoryId: 'viv', amount: 900000, date: '2026-09-07' }),
    tx({ categoryId: 'deu', amount: 400000, date: '2026-09-08' }),
    tx({ categoryId: 'aho', amount: 100000, date: '2026-09-09' }),
    tx({ type: 'transfer', amount: 250000, goalId: 'g1', transferDirection: 'deposit', date: '2026-09-10' }),
    tx({ type: 'transfer', amount: 60000, accountId: 'a1', toAccountId: 'a2', date: '2026-09-11' }),
    tx({ type: 'income', categoryId: 'sal', amount: 500000, nature: 'apertura', date: '2026-09-12' }),
  ];

  it('clasifica en operación, inversión y financiación, y cuadra con los saldos', () => {
    const cf = buildCashFlow(args(list()));
    expect(cf.opening).toBe(2000000);
    expect(cf.operacion).toMatchObject({ neto: 2100000 });                     // +3.000.000 − 900.000
    expect(cf.financiacion).toMatchObject({ neto: 600000 });                   // +1.000.000 préstamo − 400.000 capital
    expect(cf.inversion.aportesObjetivos).toBe(-250000);
    expect(cf.inversion.neto).toBe(-350000);                                   // −100.000 ahorro − 250.000 objetivo
    expect(cf.otros).toMatchObject({ aperturas: 500000, traspasos: -60000 });
    expect(cf.flujoNeto).toBe(2790000);
    expect(cf.calculatedClosing).toBe(4790000);
    expect(cf.closing).toBe(accountBalance(list(), 'a1'));
    expect(cf.difference).toBe(0);
  });

  it('el saldo final de un período es el saldo inicial del siguiente', () => {
    const aug = buildCashFlow(args(list(), periodRange('mes', 2026, 7)));
    const sep = buildCashFlow(args(list(), SEP));
    expect(aug.closing).toBe(sep.opening);
  });

  it('el ámbito del hogar solo mira las cuentas compartidas', () => {
    const cf = buildCashFlow(args([...list(), tx({ type: 'income', categoryId: 'sal', amount: 700, accountId: 'a2', date: '2026-09-15' })], SEP, hogar));
    expect(cf.operacion.neto).toBe(700);
    expect(cf.otros.traspasos).toBe(60000); // entra por la transferencia desde a1
    expect(cf.difference).toBe(0);
  });

  it('los recurrentes cuentan una sola vez, en su fecha (como el saldo real)', () => {
    const rent = tx({ categoryId: 'viv', amount: 1000000, recurring: true, frequency: 'mensual', date: '2026-09-01' });
    const cf = buildCashFlow(args([rent], Q3));
    expect(cf.operacion.salidas.total).toBe(1000000);
    expect(cf.difference).toBe(0);
  });

  it('las filas muestran las salidas en negativo y el saldo final', () => {
    const rows = cashFlowRows(buildCashFlow(args(list())));
    expect(rows[0]).toMatchObject({ label: 'Saldo inicial de efectivo', amount: 2000000 });
    expect(rows.find((r) => r.label === 'Pagos de gastos operativos').amount).toBe(-900000);
    expect(rows.find((r) => r.label === 'Vivienda').amount).toBe(-900000);
    expect(rows[rows.length - 1]).toMatchObject({ label: 'Saldo final de efectivo', amount: 4790000 });
  });

  it('el comparativo del flujo trae el saldo inicial del período anterior', () => {
    const cur = buildCashFlow(args(list(), SEP));
    const prev = buildCashFlow(args(list(), periodRange('mes', 2026, 7)));
    const rows = cashFlowRows(cur, prev);
    expect(rows[0]).toMatchObject({ amount: 2000000, previous: 0 });
  });
});

describe('exportación', () => {
  const rows = [
    { kind: 'title', label: 'INGRESOS', level: 0, amount: null, previous: null, delta: null, pct: null },
    { kind: 'line', label: 'Salario, "neto"', level: 1, amount: 1500.5, previous: 1000, delta: 500.5, pct: 50.05 },
  ];
  it('CSV en formato español: ; como separador, coma decimal y comillas escapadas', () => {
    const csv = rowsToCsv(rows, { title: 'Estado de Resultados', subtitle: 'Septiembre 2026', comparative: true, previousLabel: 'Agosto 2026' });
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Estado de Resultados');
    expect(lines[3]).toBe('Concepto;Período;Agosto 2026;Variación;Variación %');
    expect(lines[4]).toBe('INGRESOS;;;;');
    expect(lines[5]).toBe('"  Salario, ""neto""";1500,50;1000;500,50;50,05');
  });
  it('CSV sin comparativo solo trae dos columnas', () => {
    const csv = rowsToCsv(rows, { title: 't', subtitle: 's', comparative: false });
    expect(csv.split('\r\n')[3]).toBe('Concepto;Período');
  });
  it('HTML escapa el contenido para que no se pueda inyectar código', () => {
    const html = statementToHtml([{ kind: 'line', label: '<img src=x onerror=alert(1)>', level: 0, amount: 5, previous: null, delta: null, pct: null }], {
      title: 'A & B', subtitle: 's', notes: ['<b>nota</b>'], comparative: false, formatMoney: (v) => `$${v}`,
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('&lt;b&gt;nota&lt;/b&gt;');
    expect(html).toContain('$5');
  });
});
