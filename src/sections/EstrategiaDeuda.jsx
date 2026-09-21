import React, { useMemo, useState } from 'react';
import { TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card } from '../ui/primitives';
import { formatMoney } from '../lib/format';
import { todayISO } from '../lib/finance';
import { addMonths } from '../lib/amortization';
import { debtsFromCredits, compareStrategies, STRATEGIES } from '../lib/debtStrategy';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (n) => { const d = addMonths(todayISO(), n); return `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`; };
const plural = (n) => `${n} ${n === 1 ? 'mes' : 'meses'}`;

// Créditos → simulador de estrategias de pago (avalancha vs bola de nieve) con un extra mensual.
export function EstrategiaDeuda({ data }) {
  const [open, setOpen] = useState(false);
  const [extraText, setExtraText] = useState('');
  const currency = data.currency;
  const money = (n) => formatMoney(n, currency);
  const debts = useMemo(() => debtsFromCredits(data.creditsWithPayments, currency), [data.creditsWithPayments, currency]);
  const extra = Math.max(0, parseFloat(extraText) || 0);
  const cmp = useMemo(() => (debts.length ? compareStrategies(debts, extra) : null), [debts, extra]);
  if (!debts.length) return null;

  const row = (label, sim, hint, best) => (
    <div key={label} className="rounded-xl p-3 mb-2" style={{ background: best ? T.tealSoft : T.bg, border: `1px solid ${best ? T.teal : T.border}` }}>
      <div className="flex items-center justify-between">
        <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{label}{best ? ' · la que menos intereses paga' : ''}</p>
      </div>
      {hint && <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>{hint}</p>}
      {sim.finished ? (
        <>
          <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }} className="mt-1">Terminas de pagar todo en <strong>{plural(sim.months)}</strong> ({monthLabel(sim.months)}) · intereses <strong style={{ fontFamily: FONT_MONO }}>{money(sim.totalInterest)}</strong></p>
          {sim.interestSaved !== null && (sim.interestSaved > 0 || sim.monthsSaved > 0) && (
            <p style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 600 }}>Ahorras {money(sim.interestSaved)} en intereses{sim.monthsSaved > 0 ? ` y ${plural(sim.monthsSaved)}` : ''} frente a pagar solo las cuotas</p>
          )}
          <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Orden en que se liquidan: {sim.payoffs.map((p) => `${p.name} (${plural(p.month)})`).join(' → ')}</p>
        </>
      ) : (
        <p style={{ fontSize: 12, color: T.danger, fontFamily: FONT_BODY }} className="mt-1">Con estos pagos la deuda no se termina de pagar: alguna cuota no cubre ni sus intereses.</p>
      )}
    </div>
  );

  return (
    <Card style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full" aria-expanded={open}>
        <span className="flex items-center gap-2"><TrendingDown size={16} color={T.teal} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Estrategia para pagar tus deudas</span></span>
        {open ? <ChevronUp size={16} color={T.inkSoft} /> : <ChevronDown size={16} color={T.inkSoft} />}
      </button>
      {!open && <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Simula avalancha vs bola de nieve con un dinero extra al mes ({debts.length} {debts.length === 1 ? 'deuda' : 'deudas'}).</p>}
      {open && cmp && (
        <div className="mt-3">
          <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">
            Cada crédito paga su cuota y el dinero extra (más lo que liberan los créditos que se van terminando) se dirige a uno según la estrategia. No incluye el seguro de las cuotas.
          </p>
          <label className="block mb-3">
            <span className="block text-sm mb-1.5" style={{ color: T.inkSoft, fontFamily: FONT_BODY }}>Dinero extra que puedes poner cada mes</span>
            <input style={inputStyle} type="number" value={extraText} onChange={(e) => setExtraText(e.target.value)} placeholder="0" aria-label="Dinero extra al mes" />
          </label>
          <div className="rounded-xl p-3 mb-2" style={{ background: T.bg }}>
            <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>Solo pagando las cuotas</p>
            {cmp.base.finished
              ? <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>Terminas en <strong>{plural(cmp.base.months)}</strong> ({monthLabel(cmp.base.months)}) · intereses <strong style={{ fontFamily: FONT_MONO }}>{money(cmp.base.totalInterest)}</strong></p>
              : <p style={{ fontSize: 12, color: T.danger, fontFamily: FONT_BODY }}>Alguna cuota no alcanza a cubrir sus intereses.</p>}
          </div>
          {STRATEGIES.map((s) => row(s.label, cmp[s.id], s.hint, cmp.best === s.id))}
        </div>
      )}
    </Card>
  );
}
