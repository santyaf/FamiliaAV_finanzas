import React from 'react';
import { TrendingUp } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO } from '../ui/theme';
import { Card, EmptyState, CategoryIcon } from '../ui/primitives';
import { formatMoney } from '../lib/format';
import { lastMonthKeys, monthCashFlow, occurrencesInMonth } from '../lib/finance';

const MONTH_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
function monthLabel(mKey) {
  const m = Number(mKey.split('-')[1]);
  return MONTH_LABEL[m - 1];
}

// Barras agrupadas ingresos/gastos por mes — a mano, sin librería (recharts
// se quitó por tamaño de bundle en la Fase 11).
export function CashFlowChart({ months, height = 140 }) {
  const width = 300;
  const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)));
  const groupWidth = width / months.length;
  const barWidth = Math.max(groupWidth / 2 - 6, 4);
  return (
    <svg viewBox={`0 0 ${width} ${height + 16}`} role="img" aria-label="Flujo de caja mensual" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {months.map((m, i) => {
        const x0 = i * groupWidth;
        const incH = (m.income / max) * height;
        const expH = (m.expense / max) * height;
        return (
          <g key={m.key}>
            <rect x={x0 + 3} y={height - incH} width={barWidth} height={incH} fill={T.teal} rx={2} />
            <rect x={x0 + barWidth + 7} y={height - expH} width={barWidth} height={expH} fill={T.coral} rx={2} />
            <text x={x0 + groupWidth / 2} y={height + 12} textAnchor="middle" fontSize="8.5" fill={T.inkSoft}>{monthLabel(m.key)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Tendencias({ data }) {
  const currency = data.currency;
  const months = lastMonthKeys(6).map((key) => ({ key, ...monthCashFlow(data.transactions, key) }));
  const hasAnyData = months.some((m) => m.income > 0 || m.expense > 0);

  // Top categorías de gasto del periodo (últimos 4 meses), mes a mes.
  const tableMonths = months.slice(-4);
  const expenseCats = data.categories.filter((c) => c.type === 'expense');
  const categoryRows = expenseCats
    .map((c) => {
      const byMonth = tableMonths.map((m) => data.transactions
        .filter((t) => t.type === 'expense' && t.categoryId === c.id)
        .reduce((s, t) => s + t.amount * occurrencesInMonth(t, m.key), 0));
      return { category: c, byMonth, total: byMonth.reduce((a, b) => a + b, 0) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-1">Tendencias</p>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Flujo de caja y gasto por categoría de los últimos meses.
      </p>

      {!hasAnyData && (
        <EmptyState icon={<TrendingUp size={36} color={T.teal} />} title="Aún no hay suficientes datos" subtitle="Registra movimientos durante algunas semanas para empezar a ver la tendencia." />
      )}

      {hasAnyData && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Flujo de caja mensual</p>
            <CashFlowChart months={months} />
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 2, background: T.teal, display: 'inline-block' }} /><span style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>Ingresos</span></span>
              <span className="flex items-center gap-1.5"><span style={{ width: 9, height: 9, borderRadius: 2, background: T.coral, display: 'inline-block' }} /><span style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>Gastos</span></span>
            </div>
          </Card>

          {categoryRows.length > 0 && (
            <Card>
              <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Gasto por categoría, mes a mes</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 380 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 500 }}>Categoría</th>
                      {tableMonths.map((m) => (
                        <th key={m.key} style={{ textAlign: 'right', padding: '4px 0 4px 8px', fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 500, whiteSpace: 'nowrap' }}>{monthLabel(m.key)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categoryRows.map((r) => (
                      <tr key={r.category.id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: '6px 8px 6px 0' }}>
                          <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY, whiteSpace: 'nowrap' }}>
                            <CategoryIcon icon={r.category.icon} size={13} color={T.inkSoft} /> {r.category.name}
                          </span>
                        </td>
                        {r.byMonth.map((v, i) => (
                          <td key={i} style={{ textAlign: 'right', padding: '6px 0 6px 8px', fontFamily: FONT_MONO, fontSize: 11.5, color: v > 0 ? T.ink : T.border, whiteSpace: 'nowrap' }}>
                            {v > 0 ? formatMoney(v, currency) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
