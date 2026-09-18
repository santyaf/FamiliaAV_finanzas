import React, { useMemo, useState } from 'react';
import { FileText, Download, Printer, CheckCircle2, AlertTriangle } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, EmptyState, GhostButton } from '../ui/primitives';
import { formatMoney } from '../lib/format';
import { todayISO } from '../lib/finance';
import {
  PERIOD_TYPES, recentPeriods, previousPeriod, accountsInScope,
  buildIncomeStatement, buildCashFlow, incomeStatementRows, cashFlowRows, rowsToCsv, statementToHtml,
} from '../lib/statements';

const HOW_MANY = { mes: 12, trimestre: 8, semestre: 6, anio: 5 };
const STATEMENTS = [
  { id: 'resultados', label: 'Estado de resultados' },
  { id: 'flujo', label: 'Flujo de efectivo' },
];
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function Chips({ options, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} className="flex-shrink-0 rounded-full px-3 py-1.5"
          style={{ background: value === id ? T.ink : T.surface, border: `1px solid ${value === id ? T.ink : T.border}` }}>
          <span style={{ fontSize: 12.5, color: value === id ? '#fff' : T.inkSoft, fontFamily: FONT_BODY }}>{label}</span>
        </button>
      ))}
    </div>
  );
}

// Informes financieros (Fase 17): Estado de resultados y Flujo de efectivo, por
// mes / trimestre / semestre / año, de tus finanzas personales o del hogar.
export function Informes({ data, actions }) {
  const [scopeKind, setScopeKind] = useState('personal');
  const [periodType, setPeriodType] = useState('mes');
  const [periodStart, setPeriodStart] = useState('');
  const [statement, setStatement] = useState('resultados');
  const [compare, setCompare] = useState(true);
  const currency = data.currency;
  const money = (n) => formatMoney(n, currency);

  const periods = useMemo(() => recentPeriods(periodType, todayISO(), HOW_MANY[periodType]), [periodType]);
  const range = periods.find((p) => p.start === periodStart) || periods[0];
  const prevRange = previousPeriod(range);
  const scope = scopeKind === 'hogar' ? { kind: 'hogar' } : { kind: 'personal', memberId: actions.userId };
  const scopeAccounts = accountsInScope(data.accounts, scope);
  const me = data.members.find((m) => m.id === actions.userId);

  const { rows, cashFlow, hasNoRubro } = useMemo(() => {
    const base = { transactions: data.transactions, categories: data.categories, accounts: data.accounts, scope };
    if (statement === 'resultados') {
      const cur = buildIncomeStatement({ ...base, range });
      const prev = compare ? buildIncomeStatement({ ...base, range: prevRange }) : null;
      const noRubro = [cur.ingresosOperativos, cur.ingresosFinanciamiento, cur.gastosOperativos].some((s) => s.groups.some((g) => g.name === 'Sin rubro'));
      return { rows: incomeStatementRows(cur, prev), cashFlow: null, hasNoRubro: noRubro };
    }
    const cur = buildCashFlow({ ...base, range });
    const prev = compare ? buildCashFlow({ ...base, range: prevRange }) : null;
    return { rows: cashFlowRows(cur, prev), cashFlow: cur, hasNoRubro: false };
  }, [data.transactions, data.categories, data.accounts, scopeKind, actions.userId, range.start, range.end, statement, compare]);

  const statementLabel = STATEMENTS.find((s) => s.id === statement).label;
  const scopeLabel = scopeKind === 'hogar' ? `Hogar ${data.householdName}` : `Personal — ${me?.name || 'yo'}`;
  const subtitle = `${scopeLabel} · ${range.label} (${range.start} a ${range.end}) · cifras en ${currency}`;
  const notes = [
    scopeKind === 'hogar'
      ? 'Ámbito Hogar: movimientos de las cuentas compartidas. Lo que está en cuentas individuales de cada integrante no se incluye.'
      : 'Ámbito Personal: movimientos de tus cuentas individuales. Un gasto compartido pagado desde tu cuenta cuenta solo por tu parte del reparto.',
    statement === 'resultados'
      ? 'El capital de las deudas pagado, el ahorro/inversión y los saldos iniciales no son gasto ni ingreso operativo. Un préstamo recibido se muestra como ingreso por financiamiento; el resultado operativo lo excluye. Los gastos recurrentes se cuentan cada mes.'
      : 'Flujo de efectivo: solo movimientos efectivamente registrados (los recurrentes, en su fecha), para que cuadre con los saldos reales de las cuentas.',
  ];
  const baseName = `${slug(statementLabel)}-${slug(range.label)}-${scopeKind}`;
  const exportMeta = { title: statementLabel, subtitle, comparative: compare, previousLabel: prevRange.label };

  function downloadCsv() {
    const csv = rowsToCsv(rows, exportMeta);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${baseName}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function printPdf() {
    const html = statementToHtml(rows, { ...exportMeta, notes, formatMoney: money });
    const w = window.open('', '_blank');
    if (!w) { alert('El navegador bloqueó la ventana. Permite ventanas emergentes para imprimir o guardar como PDF.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  const emptyScope = scopeAccounts.length === 0;
  const amountStyle = (r) => ({
    fontFamily: FONT_MONO, fontSize: r.kind === 'total' ? 13 : 12.5, textAlign: 'right', whiteSpace: 'nowrap',
    fontWeight: r.kind === 'total' || r.kind === 'subtotal' || r.kind === 'group' ? 700 : 400,
    color: r.kind === 'memo' ? T.inkSoft : T.ink,
  });

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={18} color={T.teal} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Informes financieros</p>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Estado de resultados y flujo de efectivo, por mes, trimestre, semestre o año — de tus finanzas personales o del hogar.
      </p>

      <Card style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-1.5">Ámbito</p>
        <Chips options={[['personal', 'Personal (mis cuentas)'], ['hogar', 'Hogar (cuentas compartidas)']]} value={scopeKind} onChange={setScopeKind} />
        <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-1.5 mt-3">Informe</p>
        <Chips options={STATEMENTS.map((s) => [s.id, s.label])} value={statement} onChange={setStatement} />
        <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-1.5 mt-3">Período</p>
        <Chips options={PERIOD_TYPES.map((p) => [p.id, p.label])} value={periodType} onChange={(id) => { setPeriodType(id); setPeriodStart(''); }} />
        <select style={{ ...inputStyle, marginTop: 8 }} value={range.start} onChange={(e) => setPeriodStart(e.target.value)}>
          {periods.map((p) => <option key={p.start} value={p.start}>{p.label}</option>)}
        </select>
        <label className="flex items-center gap-2 mt-3">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>Comparar con {prevRange.label}</span>
        </label>
      </Card>

      {emptyScope ? (
        <EmptyState icon={<FileText size={34} color={T.teal} />}
          title={scopeKind === 'hogar' ? 'No hay cuentas compartidas' : 'No tienes cuentas individuales'}
          subtitle={scopeKind === 'hogar' ? 'Crea una cuenta compartida en Gestión → Cuentas para ver el informe del hogar.' : 'Tus movimientos personales salen de tus cuentas individuales. Crea una en Gestión → Cuentas, o mira el informe del hogar.'} />
      ) : (
        <>
          <div className="flex gap-2 mb-3">
            <GhostButton onClick={downloadCsv} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13.5 }}><Download size={15} /> CSV (Excel)</GhostButton>
            <GhostButton onClick={printPdf} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13.5 }}><Printer size={15} /> Imprimir / PDF</GhostButton>
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div className="px-4 pt-3 pb-2">
              <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, color: T.ink }}>{statementLabel}</p>
              <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{scopeLabel} · {range.label}</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: compare ? 520 : 300 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    <th style={{ textAlign: 'left', padding: '6px 16px', fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600 }}>Concepto</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600 }}>{range.label}</th>
                    {compare && <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600 }}>{prevRange.label}</th>}
                    {compare && <th style={{ textAlign: 'right', padding: '6px 16px 6px 8px', fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600 }}>Var. %</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ background: r.kind === 'title' ? T.bg : 'transparent', borderTop: r.kind === 'total' ? `1px solid ${T.border}` : 'none' }}>
                      <td style={{ padding: `${r.kind === 'title' ? 7 : 4}px 8px 4px ${16 + r.level * 14}px`, fontSize: r.kind === 'title' ? 11 : 12.5, fontFamily: FONT_BODY,
                        color: r.kind === 'memo' ? T.inkSoft : T.ink, fontWeight: r.kind === 'title' || r.kind === 'total' || r.kind === 'subtotal' || r.kind === 'group' ? 700 : 400,
                        letterSpacing: r.kind === 'title' ? 0.3 : 0 }}>{r.label}</td>
                      {r.kind === 'title' ? <td colSpan={compare ? 3 : 1} /> : (
                        <>
                          <td style={{ ...amountStyle(r), padding: '4px 8px' }}>{money(r.amount)}</td>
                          {compare && <td style={{ ...amountStyle(r), padding: '4px 8px', color: T.inkSoft }}>{r.previous === null ? '' : money(r.previous)}</td>}
                          {compare && <td style={{ ...amountStyle(r), padding: '4px 16px 4px 8px', fontSize: 11.5, color: r.pct === null ? T.inkSoft : r.pct > 0 ? T.teal : r.pct < 0 ? T.coral : T.inkSoft }}>{r.pct === null ? '' : `${r.pct > 0 ? '+' : ''}${r.pct}%`}</td>}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {cashFlow && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2 mt-3" style={{ background: cashFlow.difference === 0 ? T.tealSoft : T.coralSoft }}>
              {cashFlow.difference === 0 ? <CheckCircle2 size={15} color={T.teal} style={{ marginTop: 2, flexShrink: 0 }} /> : <AlertTriangle size={15} color={T.coral} style={{ marginTop: 2, flexShrink: 0 }} />}
              <p style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>
                {cashFlow.difference === 0
                  ? 'El flujo cuadra con los saldos de las cuentas: saldo inicial + flujo neto = saldo final.'
                  : `No cuadra con los saldos por ${money(cashFlow.difference)}. Revisa movimientos de este período.`}
              </p>
            </div>
          )}
          {hasNoRubro && (
            <div className="flex items-start gap-2 rounded-xl px-3 py-2 mt-3" style={{ background: T.goldSoft }}>
              <AlertTriangle size={15} color={T.gold} style={{ marginTop: 2, flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>Hay categorías sin rubro (aparecen como "Sin rubro"). Clasifícalas en Ajustes → Categorías para que el informe quede bien segmentado.</p>
            </div>
          )}
          <div className="mt-3">
            {notes.map((n) => <p key={n} style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-1">{n}</p>)}
          </div>
        </>
      )}
    </div>
  );
}
