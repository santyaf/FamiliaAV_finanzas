import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, GhostButton, ProgressBar } from '../ui/primitives';
import { formatMoney } from '../lib/format';
import { todayISO } from '../lib/finance';
import { buildTaxSummary, taxSummaryCsv, taxTagsFor, defaultUvt } from '../lib/tax';

function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Chips({ options, value, onChange, label }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} role="radio" aria-checked={value === id} onClick={() => onChange(id)} className="flex-shrink-0 rounded-full px-3 py-1.5"
          style={{ background: value === id ? T.ink : T.surface, border: `1px solid ${value === id ? T.ink : T.border}` }}>
          <span style={{ fontSize: 12.5, color: value === id ? T.surface : T.inkSoft, fontFamily: FONT_BODY }}>{text}</span>
        </button>
      ))}
    </div>
  );
}

// Gestión → Declaración de renta: resumen anual ORIENTATIVO (ingresos, posibles deducciones y si por los topes
// de la DIAN probablemente toca declarar). No calcula el impuesto ni reemplaza a un contador.
export function Renta({ data, actions }) {
  const thisYear = Number(todayISO().slice(0, 4));
  const [year, setYear] = useState(thisYear - 1); // la declaración que se presenta ahora es la del año anterior
  const [scopeKind, setScopeKind] = useState('personal');
  const [uvtText, setUvtText] = useState('');
  const [uvrValue, setUvrValue] = useState(null);
  const money = (n) => formatMoney(n, data.currency);
  const me = data.members.find((m) => m.id === actions.userId);

  const hasUvr = (data.creditsWithPayments || []).some((cp) => cp.credit.currency === 'UVR');
  useEffect(() => {
    if (hasUvr && actions.getLatestUvr) actions.getLatestUvr().then((r) => r && setUvrValue(r.value)).catch(() => {});
  }, [hasUvr]);

  const uvt = Number(uvtText) > 0 ? Number(uvtText) : defaultUvt(year);
  const scope = scopeKind === 'hogar' ? { kind: 'hogar' } : { kind: 'personal', memberId: actions.userId };
  const summary = useMemo(() => buildTaxSummary({
    transactions: data.transactions, categories: data.categories, accounts: data.accounts, assets: data.assets || [],
    creditsWithPayments: data.creditsWithPayments || [], scope, year, uvt, uvrValue,
  }), [data.transactions, data.categories, data.accounts, data.assets, data.creditsWithPayments, scopeKind, actions.userId, year, uvt, uvrValue]);

  const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3, thisYear - 4];
  const scopeLabel = scopeKind === 'hogar' ? `Hogar ${data.householdName}` : `Personal — ${me?.name || 'yo'}`;
  const taggable = data.categories.filter((c) => (c.type === 'income' || c.type === 'expense') && c.nature === 'operativo');

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center gap-2 mb-1"><FileSpreadsheet size={18} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Declaración de renta</p></div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Resumen del año con lo que ya registraste: ingresos, gastos que pueden ser deducibles y si por los topes de la DIAN probablemente te toca declarar.
      </p>

      <div className="mb-2"><Chips label="Año gravable" value={year} onChange={setYear} options={years.map((y) => [y, String(y)])} /></div>
      <div className="mb-3"><Chips label="Ámbito" value={scopeKind} onChange={setScopeKind} options={[['personal', 'Personal'], ['hogar', 'Hogar']]} /></div>

      <Card style={{ marginBottom: 12, background: summary.mustFile ? T.amberSoft : T.tealSoft, border: 'none' }}>
        <div className="flex items-start gap-2">
          {summary.mustFile ? <AlertTriangle size={18} color={T.amber} style={{ marginTop: 1 }} /> : <CheckCircle2 size={18} color={T.teal} style={{ marginTop: 1 }} />}
          <div>
            <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>{summary.mustFile ? `Probablemente debes declarar el año ${year}` : `Probablemente no estás obligado a declarar el año ${year}`}</p>
            <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-0.5">Basta con alcanzar uno de los topes. Solo se ve lo registrado en {scopeLabel}; confírmalo con la DIAN o un contador.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          {summary.thresholds.map((m) => (
            <div key={m.id}>
              <div className="flex items-center justify-between gap-2">
                <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>{m.label}</span>
                <span style={{ fontSize: 12, color: m.reached ? T.danger : T.inkSoft, fontFamily: FONT_MONO, fontWeight: m.reached ? 700 : 400 }}>{money(m.value)} / {money(m.limit)}</span>
              </div>
              <ProgressBar value={m.pct} color={m.reached ? T.danger : T.teal} bg={T.surface} />
            </div>
          ))}
        </div>
        {summary.uvrPending && <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">No se pudo convertir un crédito en UVR: el patrimonio puede estar subestimado.</p>}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Ingresos del año</p>
        {[['Laborales', summary.income.laboral], ['De capital', summary.income.capital], ['Otros / sin clasificar', summary.income.otros]].map(([label, v]) => (
          <div key={label} className="flex justify-between py-1"><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{label}</span><span style={{ fontSize: 13, fontFamily: FONT_MONO, color: T.ink }}>{money(v)}</span></div>
        ))}
        <div className="flex justify-between pt-2 mt-1" style={{ borderTop: `1px solid ${T.border}` }}><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 700 }}>Total</span><span style={{ fontSize: 13, fontFamily: FONT_MONO, color: T.ink, fontWeight: 700 }}>{money(summary.income.total)}</span></div>
        {(summary.other.loans > 0 || summary.other.assetSales > 0) && (
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">
            No incluye {[summary.other.loans > 0 && `préstamos recibidos (${money(summary.other.loans)})`, summary.other.assetSales > 0 && `venta de activos (${money(summary.other.assetSales)}), que puede generar ganancia ocasional`].filter(Boolean).join(' ni ')}.
          </p>
        )}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-1">Posibles deducciones</p>
        {summary.deductions.length === 0 ? (
          <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Nada etiquetado todavía. Marca abajo qué categorías de gasto pueden ser deducibles (intereses de vivienda, medicina prepagada, AFC…).</p>
        ) : (
          <>
            {summary.deductions.map((d) => (
              <div key={d.tag} className="py-2" style={{ borderBottom: `1px solid ${T.border}` }}>
                <div className="flex justify-between gap-2"><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{d.label}</span><span style={{ fontSize: 13, fontFamily: FONT_MONO, color: T.teal, fontWeight: 700 }}>{money(d.allowed)}</span></div>
                <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Pagado {money(d.total)} · {d.note}{d.excess > 0 ? ` · ${money(d.excess)} por encima del tope` : ''}</p>
                <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>{d.byCategory.map((c) => c.name).join(', ')}</p>
              </div>
            ))}
            <div className="flex justify-between pt-2"><span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 700 }}>Total aprovechable</span><span style={{ fontSize: 13, fontFamily: FONT_MONO, color: T.teal, fontWeight: 700 }}>{money(summary.allowedWithinCap)}</span></div>
            <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Con el límite global aproximado del 40 % del ingreso o 1.340 UVT ({money(summary.globalCap)}).</p>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-1">Uso tributario de tus categorías</p>
        <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Elige para cada categoría cómo entra en la declaración. Solo lo etiquetado se suma arriba.</p>
        <div className="flex flex-col gap-2">
          {taggable.map((c) => (
            <label key={c.id} className="flex items-center justify-between gap-2">
              <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }} className="flex-1 min-w-0 truncate">{c.name}<span style={{ color: T.inkSoft, fontSize: 11 }}> · {c.type === 'income' ? 'ingreso' : 'gasto'}</span></span>
              <select aria-label={`Uso tributario de ${c.name}`} value={c.taxTag || ''} onChange={(e) => actions.setCategoryTaxTag(c.id, e.target.value || null)}
                style={{ ...inputStyle, width: 190, padding: '6px 8px', fontSize: 12.5 }}>
                <option value="">{c.type === 'income' ? 'Otros ingresos' : 'No deducible'}</option>
                {taxTagsFor(c.type).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <label className="block mb-3">
          <span style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Valor de la UVT del año {year} (editable)</span>
          <input style={inputStyle} inputMode="decimal" value={uvtText} onChange={(e) => setUvtText(e.target.value)} placeholder={String(defaultUvt(year))} aria-label="Valor de la UVT" />
        </label>
        <GhostButton onClick={() => download(`renta-${year}-${scopeKind}.csv`, taxSummaryCsv(summary, { title: `Resumen para declaración de renta — ${scopeLabel}` }))} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13.5 }}>
          <Download size={15} /> Descargar CSV (Excel)
        </GhostButton>
      </Card>

      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>
        Herramienta orientativa: no calcula el impuesto ni reemplaza la asesoría de un contador. Las reglas, los topes y el valor de la UVT cambian cada año; verifícalos con la DIAN antes de presentar. Los certificados (ingresos y retenciones, intereses, medicina prepagada) los emiten tus entidades.
      </p>
    </div>
  );
}
