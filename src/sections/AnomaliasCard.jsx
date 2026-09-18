import React, { useMemo, useState } from 'react';
import { Copy, TrendingUp, Repeat, AlertTriangle, Eye, X } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY } from '../ui/theme';
import { Card } from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { detectAnomalies, describeAnomaly } from '../lib/anomalies';
import { readJSON, writeJSON, getStorage } from '../lib/safeStorage';

const TYPE_ICON = {
  duplicate: Copy, unusual_amount: AlertTriangle, price_increase: TrendingUp,
  category_spike: TrendingUp, many_subscriptions: Repeat,
};
const SEVERITY_COLOR = { high: T.coral, medium: T.gold, low: T.inkSoft };
const COLLAPSED_COUNT = 3;

// "Para revisar": avisos automáticos sobre movimientos raros (duplicados, gastos
// inusuales, subidas de precio…). No son necesariamente un problema, así que
// cada uno se puede descartar; lo descartado se recuerda en este dispositivo.
export function AnomaliasCard({ data, actions, transactions, setModal }) {
  const storageKey = `fam_anomalies_dismissed_v1:${actions.householdId}`;
  const [dismissed, setDismissed] = useState(() => readJSON(getStorage(), storageKey, []));
  const [expanded, setExpanded] = useState(false);
  const all = useMemo(() => detectAnomalies(transactions), [transactions]);
  const visible = all.filter((a) => !dismissed.includes(a.key));
  if (visible.length === 0) return null;

  const currency = data.currency;
  const describe = (a) => describeAnomaly(a, {
    formatMoney: (v) => formatMoney(v, currency),
    formatDate,
    categoryName: (id) => data.categories.find((c) => c.id === id)?.name || 'esta categoría',
  });
  function dismiss(key) {
    const next = [...dismissed, key];
    setDismissed(next);
    writeJSON(getStorage(), storageKey, next);
  }
  const shown = expanded ? visible : visible.slice(0, COLLAPSED_COUNT);

  return (
    <Card style={{ marginBottom: 16 }}>
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle size={16} color={T.ink} />
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Para revisar</span>
        <span className="rounded-full px-2" style={{ background: T.bg, fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>{visible.length}</span>
      </div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Avisos automáticos — pueden no ser un problema. Descarta los que ya revisaste.
      </p>
      <div className="flex flex-col gap-3">
        {shown.map((a) => {
          const Icon = TYPE_ICON[a.type] || AlertTriangle;
          const color = SEVERITY_COLOR[a.severity];
          const { title, detail } = describe(a);
          const tx = a.txIds[0] && data.transactions.find((t) => t.id === a.txIds[0]);
          return (
            <div key={a.key} className="flex items-start gap-2.5">
              <div style={{ width: 32, height: 32, borderRadius: 10, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} color={color} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{title}</p>
                <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>{detail}</p>
              </div>
              <div className="flex items-center flex-shrink-0">
                {tx && !tx.pending && (
                  <button onClick={() => setModal({ type: 'editTransaction', payload: tx })} aria-label="Ver el movimiento" title="Ver el movimiento"
                    className="flex items-center justify-center active:opacity-60" style={{ width: 36, height: 36 }}>
                    <Eye size={16} color={T.inkSoft} />
                  </button>
                )}
                <button onClick={() => dismiss(a.key)} aria-label="Descartar aviso" title="Descartar aviso"
                  className="flex items-center justify-center active:opacity-60" style={{ width: 36, height: 36 }}>
                  <X size={16} color={T.inkSoft} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {visible.length > COLLAPSED_COUNT && (
        <button onClick={() => setExpanded((e) => !e)} className="mt-3" style={{ fontSize: 12.5, color: T.teal, fontFamily: FONT_BODY, fontWeight: 600, minHeight: 32 }}>
          {expanded ? 'Ver menos' : `Ver ${visible.length - COLLAPSED_COUNT} más`}
        </button>
      )}
    </Card>
  );
}
