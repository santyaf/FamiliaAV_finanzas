import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO } from '../ui/theme';
import { Card } from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { todayISO } from '../lib/finance';
import { buildCalendar, monthGrid, shiftMonth, EVENT_KINDS } from '../lib/calendar';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const flowColor = (e) => (e.status === 'pagado' ? T.inkSoft : e.flow === 'in' ? T.teal : e.flow === 'out' ? T.coral : T.gold);

// Gestión → Calendario: lo que entra y lo que sale cada día del mes (recurrentes, obligaciones, cuotas
// de crédito, cortes y pagos de tarjeta, metas y vencimientos de inversión).
export function Calendario({ data }) {
  const today = todayISO();
  const [monthKey, setMonthKey] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const currency = data.currency;
  const money = (n) => formatMoney(n, currency);

  const cal = useMemo(() => buildCalendar({
    monthKey, transactions: data.transactions, obligations: data.obligations || [], creditsWithPayments: data.creditsWithPayments || [],
    accounts: data.accounts, goals: data.goals, assets: data.assets || [], categories: data.categories,
  }), [monthKey, data.transactions, data.obligations, data.creditsWithPayments, data.accounts, data.goals, data.assets, data.categories]);
  const grid = monthGrid(monthKey);
  const [y, m] = monthKey.split('-').map(Number);
  const cells = Array.from({ length: grid.weeks * 7 }, (_, i) => { const day = i - grid.firstWeekday + 1; return day >= 1 && day <= grid.days ? day : null; });
  const dateOf = (day) => `${monthKey}-${String(day).padStart(2, '0')}`;
  const dayEvents = cal.byDate[selected] || [];
  const goto = (delta) => { const next = shiftMonth(monthKey, delta); setMonthKey(next); setSelected(next === today.slice(0, 7) ? today : `${next}-01`); };

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center gap-2 mb-1"><CalendarDays size={18} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Calendario financiero</p></div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Todo lo que entra y sale, día a día: ingresos y gastos recurrentes, obligaciones, cuotas de crédito, tarjetas, metas y vencimientos de inversiones.</p>

      <Card style={{ marginBottom: 12 }}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => goto(-1)} aria-label="Mes anterior" className="p-1.5"><ChevronLeft size={18} color={T.ink} /></button>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, color: T.ink, textTransform: 'capitalize' }}>{MONTHS[m - 1]} {y}</p>
          <button onClick={() => goto(1)} aria-label="Mes siguiente" className="p-1.5"><ChevronRight size={18} color={T.ink} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-1">{WEEKDAYS.map((w, i) => <span key={i} className="text-center" style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{w}</span>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <span key={i} />;
            const date = dateOf(day);
            const evs = cal.byDate[date] || [];
            const isSel = date === selected; const isToday = date === today;
            return (
              <button key={i} onClick={() => setSelected(date)} aria-label={`${day} de ${MONTHS[m - 1]}${evs.length ? `, ${evs.length} eventos` : ''}`} aria-pressed={isSel}
                className="flex flex-col items-center justify-start rounded-lg py-1" style={{ minHeight: 44, background: isSel ? T.teal : isToday ? T.tealSoft : 'transparent', border: `1px solid ${isSel ? T.teal : isToday ? T.teal : 'transparent'}` }}>
                <span style={{ fontSize: 12.5, fontFamily: FONT_MONO, color: isSel ? '#fff' : T.ink, fontWeight: isToday ? 700 : 400 }}>{day}</span>
                <span className="flex gap-0.5 mt-0.5">
                  {evs.slice(0, 3).map((e) => <span key={e.id} style={{ width: 5, height: 5, borderRadius: 3, background: isSel ? '#fff' : flowColor(e) }} />)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_MONO }}>Entra {money(cal.totals.in)}</span>
          <span style={{ fontSize: 12, color: T.coral, fontFamily: FONT_MONO }}>Sale {money(cal.totals.out)}</span>
        </div>
        <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Sin contar lo ya pagado ni las cuotas en UVR. Las tarjetas muestran sus fechas, no su monto.</p>
      </Card>

      <Card>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">{formatDate(selected)}</p>
        {dayEvents.length === 0 && <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Nada programado este día.</p>}
        {dayEvents.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-2 py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="flex items-start gap-2 min-w-0">
              <span style={{ width: 8, height: 8, borderRadius: 4, background: flowColor(e), flexShrink: 0, marginTop: 5 }} />
              <div className="min-w-0">
                <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, textDecoration: e.status === 'pagado' ? 'line-through' : 'none' }}>{e.label}</p>
                <p style={{ fontSize: 11, color: T.inkSoft }}>{EVENT_KINDS[e.kind]}{e.status === 'pagado' ? ' · pagada' : ''}</p>
              </div>
            </div>
            {e.amount !== null && e.amount !== undefined && (
              <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: flowColor(e), flexShrink: 0 }}>
                {e.currency === 'UVR' ? `${e.amount.toLocaleString('es-CO', { maximumFractionDigits: 2 })} UVR` : `${e.flow === 'in' ? '+' : e.flow === 'out' ? '-' : ''}${money(e.amount)}`}
              </span>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
