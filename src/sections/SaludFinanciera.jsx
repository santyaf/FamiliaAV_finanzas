import React, { useState } from 'react';
import { HeartPulse, ChevronDown, ChevronUp } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO } from '../ui/theme';
import { Card, ProgressBar } from '../ui/primitives';
import { computeHealth } from '../lib/health';
import { todayISO } from '../lib/finance';

const colorFor = (score) => (score >= 80 ? T.teal : score >= 60 ? T.teal : score >= 40 ? T.gold : T.coral);

// Dashboard: puntaje de salud financiera (0-100) con sus cuatro indicadores y un consejo.
export function SaludFinanciera({ data, transactions }) {
  const [open, setOpen] = useState(false);
  const h = computeHealth({
    transactions, categories: data.categories, accounts: data.accounts, budgets: data.budgets,
    creditsWithPayments: data.creditsWithPayments || [], todayISO: todayISO(),
  });

  return (
    <Card style={{ marginBottom: 16 }}>
      <div className="flex items-center gap-2 mb-2"><HeartPulse size={16} color={T.ink} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Salud financiera</span></div>
      {h.score === null ? (
        <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{h.reason}</p>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 32, lineHeight: 1, color: colorFor(h.score) }}>{h.score}<span style={{ fontSize: 14, color: T.inkSoft }}>/100</span></p>
            <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }} className="pb-0.5">{h.level}</p>
          </div>
          <div className="mt-2"><ProgressBar value={h.score} color={colorFor(h.score)} /></div>
          <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">{h.tip}</p>
          <button onClick={() => setOpen(!open)} className="flex items-center gap-1 mt-2" aria-expanded={open}>
            <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>{open ? 'Ocultar detalle' : 'Ver cómo se calcula'}</span>
            {open ? <ChevronUp size={13} color={T.teal} /> : <ChevronDown size={13} color={T.teal} />}
          </button>
          {open && (
            <div className="mt-2">
              {h.components.map((c) => (
                <div key={c.id} className="mb-2.5">
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{c.label}</span>
                    <span style={{ fontSize: 12, color: colorFor(c.score), fontFamily: FONT_MONO, fontWeight: 600 }}>{Math.round(c.score)}</span>
                  </div>
                  <ProgressBar value={c.score} color={colorFor(c.score)} height={5} />
                  <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-0.5">{c.detail}</p>
                </div>
              ))}
              <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Calculado con los últimos {h.months} {h.months === 1 ? 'mes completo' : 'meses completos'} (solo ingresos y gastos operativos). Es una guía, no un consejo financiero personalizado.</p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
