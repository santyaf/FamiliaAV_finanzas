import React, { useMemo, useRef, useState } from 'react';
import { Upload, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, GhostButton, Field } from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import {
  decodeText, detectDelimiter, parseDelimited, findHeaderRow, detectMapping, guessMappingFromData,
  detectDateFormat, buildImportRows, suggestCategories, markDuplicates, summarizeImport,
} from '../lib/statementImport';

const MAX_ROWS = 2000;
const NONE = -1;

// Importar extracto: 1) archivo o texto pegado  2) columnas  3) revisar y confirmar.
export function ImportarExtractos({ data, actions }) {
  const [step, setStep] = useState(1);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [memberId, setMemberId] = useState('');
  const [error, setError] = useState('');
  const [table, setTable] = useState(null); // { header: string[]|null, body: string[][] }
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState(null);
  const [split, setSplit] = useState(false); // débito/crédito en columnas separadas
  const [dateFormat, setDateFormat] = useState('dmy');
  const [decimal, setDecimal] = useState('auto');
  const [invertSign, setInvertSign] = useState(false);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const account = data.accounts.find((a) => a.id === accountId);
  const owners = (account?.ownerIds || []).map((id) => data.members.find((m) => m.id === id)).filter(Boolean);
  const effectiveMemberId = owners.some((m) => m.id === memberId) ? memberId : (owners.find((m) => m.id === actions.userId) || owners[0])?.id || '';

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError('El archivo pesa más de 5 MB. Divide el extracto por períodos.'); return; }
    try {
      setText(decodeText(await f.arrayBuffer()));
      setFileName(f.name);
      setError('');
    } catch {
      setError('No se pudo leer el archivo.');
    }
  }

  function goToColumns() {
    setError('');
    if (!account) { setError('Elige la cuenta a la que pertenece el extracto.'); return; }
    const parsed = parseDelimited(text, detectDelimiter(text));
    if (parsed.length < 2) { setError('No encontré filas. Sube un CSV o pega las filas copiadas desde Excel (con o sin encabezado).'); return; }
    const headerIdx = findHeaderRow(parsed);
    const header = headerIdx >= 0 ? parsed[headerIdx] : null;
    const body = parsed.slice(headerIdx >= 0 ? headerIdx + 1 : 0);
    if (body.length > MAX_ROWS) { setError(`El extracto tiene ${body.length} filas; el máximo por importación es ${MAX_ROWS}. Divídelo por períodos.`); return; }
    const guessed = header ? detectMapping(header) : guessMappingFromData(body);
    setTable({ header, body });
    setHasHeader(!!header);
    setMapping(guessed);
    setSplit(guessed.amount < 0 && (guessed.debit >= 0 || guessed.credit >= 0));
    setDateFormat(detectDateFormat(body.map((r) => r[guessed.date] ?? '').filter(Boolean)));
    setStep(2);
  }

  function goToReview() {
    setError('');
    if (mapping.date < 0) { setError('Indica la columna de la fecha.'); return; }
    if (!split && mapping.amount < 0) { setError('Indica la columna del valor (o usa débito / crédito por separado).'); return; }
    if (split && mapping.debit < 0 && mapping.credit < 0) { setError('Indica al menos la columna de débito o la de crédito.'); return; }
    const effective = split ? { ...mapping, amount: NONE } : { ...mapping, debit: NONE, credit: NONE };
    let built = buildImportRows(table.body, { mapping: effective, dateFormat, decimal, invertSign });
    built = suggestCategories(built, data.transactions, data.categories);
    built = markDuplicates(built, data.transactions, accountId);
    setRows(built.map((r) => ({ ...r, include: !r.error && !r.duplicate })));
    setStep(3);
  }

  const summary = useMemo(() => summarizeImport(rows), [rows]);
  const patchRow = (i, patch) => setRows((list) => list.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  async function doImport() {
    const chosen = rows.filter((r) => r.include && !r.error && r.categoryId);
    if (!chosen.length) { setError('No hay movimientos seleccionados con categoría.'); return; }
    setBusy(true); setError('');
    try {
      const inserted = await actions.importTransactions({
        accountId, memberId: effectiveMemberId,
        rows: chosen.map((r) => ({ date: r.date, type: r.type, amount: r.amount, description: r.description, categoryId: r.categoryId })),
      });
      setResult({ inserted });
    } catch (e) {
      setError(e.message || 'No se pudo importar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(1); setText(''); setFileName(''); setTable(null); setMapping(null); setRows([]); setResult(null); setError('');
  }

  const colName = (i) => (table?.header?.[i] ? table.header[i] : `Columna ${i + 1}`);
  const width = table ? Math.max(...table.body.slice(0, 20).map((r) => r.length), table.header?.length || 0) : 0;
  const colOptions = (allowNone = true) => (
    <>
      {allowNone && <option value={NONE}>— ninguna —</option>}
      {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{colName(i)}</option>)}
    </>
  );
  const colSelect = (label, field, allowNone = true) => (
    <Field label={label}>
      <select style={inputStyle} value={mapping[field]} onChange={(e) => setMapping({ ...mapping, [field]: Number(e.target.value) })}>{colOptions(allowNone)}</select>
    </Field>
  );
  const currency = data.currency;

  if (result) {
    return (
      <div className="pb-4 pt-2">
        <Card>
          <div className="flex items-center gap-2 mb-2"><CheckCircle2 size={20} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Importación lista</p></div>
          <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>Se registraron <strong>{result.inserted}</strong> movimientos en <strong>{account?.name}</strong>.</p>
          <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Si vuelves a importar el mismo extracto, los que ya están se marcan como duplicados y quedan sin seleccionar.</p>
          <div className="mt-4"><PrimaryButton full onClick={reset}>Importar otro extracto</PrimaryButton></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center gap-2 mb-1">
        <Upload size={18} color={T.teal} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Importar extracto</p>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Paso {step} de 3 · {step === 1 ? 'Archivo' : step === 2 ? 'Columnas' : 'Revisar'}</p>

      {step === 1 && (
        <Card>
          <Field label="Cuenta del extracto">
            <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          {owners.length > 1 && (
            <Field label="Registrar a nombre de">
              <select style={inputStyle} value={effectiveMemberId} onChange={(e) => setMemberId(e.target.value)}>
                {owners.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
          )}
          <div className="mb-3">
            <GhostButton full onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><FileText size={16} /> {fileName || 'Elegir archivo CSV'}</GhostButton>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" className="hidden" onChange={onFile} aria-label="Archivo del extracto" />
          </div>
          <Field label="…o pega aquí las filas (copiadas desde Excel o desde la página del banco)">
            <textarea style={{ ...inputStyle, minHeight: 110, fontFamily: FONT_MONO, fontSize: 12 }} value={text} onChange={(e) => { setText(e.target.value); setFileName(''); }} placeholder={'Fecha;Descripción;Valor\n01/09/2026;Café;-4.500'} aria-label="Texto del extracto" />
          </Field>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
            ¿Tu banco solo da Excel (.xlsx)? Ábrelo y guárdalo como CSV, o selecciona las filas y pégalas aquí. Nada se guarda hasta que confirmes en el paso 3.
          </p>
          {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
          <PrimaryButton full onClick={goToColumns}>Continuar</PrimaryButton>
        </Card>
      )}

      {step === 2 && table && (
        <Card>
          <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Así se leyeron las primeras filas. Confirma qué es cada columna:</p>
          <div className="overflow-x-auto mb-3" style={{ border: `1px solid ${T.border}`, borderRadius: 10 }}>
            <table style={{ fontSize: 11, fontFamily: FONT_MONO, borderCollapse: 'collapse', width: '100%' }}>
              {table.header && <thead><tr>{table.header.map((h, i) => <th key={i} style={{ padding: '4px 8px', textAlign: 'left', background: T.bg, color: T.ink, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>}
              <tbody>{table.body.slice(0, 5).map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k} style={{ padding: '4px 8px', color: T.inkSoft, whiteSpace: 'nowrap' }}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {colSelect('Fecha', 'date', false)}
          {colSelect('Descripción', 'description')}
          <div className="flex rounded-xl p-1 mb-3" style={{ background: T.bg }}>
            {[[false, 'Una columna de valor'], [true, 'Débito y crédito aparte']].map(([v, label]) => (
              <button key={String(v)} type="button" onClick={() => setSplit(v)} className="flex-1 rounded-lg py-2" style={{ background: split === v ? T.surface : 'transparent', border: split === v ? `1px solid ${T.border}` : 'none' }}>
                <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{label}</span>
              </button>
            ))}
          </div>
          {!split ? (
            <>
              {colSelect('Valor (negativo = gasto)', 'amount', false)}
              {colSelect('Tipo D/C (opcional)', 'type')}
            </>
          ) : (
            <>
              {colSelect('Débito (gastos)', 'debit')}
              {colSelect('Crédito (ingresos)', 'credit')}
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Formato de fecha">
              <select style={inputStyle} value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                <option value="dmy">Día/Mes/Año</option>
                <option value="mdy">Mes/Día/Año</option>
                <option value="ymd">Año-Mes-Día</option>
              </select>
            </Field>
            <Field label="Decimales">
              <select style={inputStyle} value={decimal} onChange={(e) => setDecimal(e.target.value)}>
                <option value="auto">Automático</option>
                <option value=",">Coma (1.234,56)</option>
                <option value=".">Punto (1,234.56)</option>
              </select>
            </Field>
          </div>
          {!split && (
            <label className="flex items-center gap-2 mb-3">
              <input type="checkbox" checked={invertSign} onChange={(e) => setInvertSign(e.target.checked)} />
              <span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>Invertir el signo (mi extracto lista las compras en positivo)</span>
            </label>
          )}
          {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
          <div className="flex gap-2">
            <GhostButton onClick={() => setStep(1)} style={{ flex: 1 }}>Atrás</GhostButton>
            <PrimaryButton onClick={goToReview} style={{ flex: 2 }}>Revisar movimientos</PrimaryButton>
          </div>
        </Card>
      )}

      {step === 3 && (
        <>
          <Card style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}><strong>{summary.selected}</strong> de {summary.total} seleccionados para <strong>{account?.name}</strong></p>
            <div className="flex gap-4 mt-1 flex-wrap">
              <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_MONO }}>Ingresos {formatMoney(summary.income, currency)}</span>
              <span style={{ fontSize: 12, color: T.coral, fontFamily: FONT_MONO }}>Gastos {formatMoney(summary.expense, currency)}</span>
            </div>
            {(summary.duplicates > 0 || summary.invalid > 0) && (
              <p className="flex items-start gap-1.5 mt-2" style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>
                <AlertTriangle size={13} color={T.gold} style={{ marginTop: 1, flexShrink: 0 }} />
                {summary.duplicates > 0 ? `${summary.duplicates} ya estaban registrados (sin seleccionar). ` : ''}{summary.invalid > 0 ? `${summary.invalid} filas no se pudieron leer.` : ''}
              </p>
            )}
            <div className="flex gap-3 mt-2">
              <button onClick={() => setRows((l) => l.map((r) => ({ ...r, include: !r.error && !r.duplicate })))}><span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Solo nuevos</span></button>
              <button onClick={() => setRows((l) => l.map((r) => ({ ...r, include: !r.error })))}><span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Todos</span></button>
              <button onClick={() => setRows((l) => l.map((r) => ({ ...r, include: false })))}><span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 500 }}>Ninguno</span></button>
            </div>
          </Card>

          <div className="flex flex-col gap-2 mb-4">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl p-2.5" style={{ background: T.surface, border: `1px solid ${T.border}`, opacity: r.error ? 0.6 : 1 }}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={r.include} disabled={!!r.error} onChange={(e) => patchRow(i, { include: e.target.checked })} aria-label={`Incluir fila ${r.line}`} style={{ marginTop: 3 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate" style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{r.description || 'Sin descripción'}</p>
                      {!r.error && <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: r.type === 'income' ? T.teal : T.coral, flexShrink: 0 }}>{r.type === 'income' ? '+' : '-'}{formatMoney(r.amount, currency)}</span>}
                    </div>
                    <p style={{ fontSize: 11, color: T.inkSoft }}>
                      {r.date ? formatDate(r.date) : '—'}
                      {r.duplicate && <span className="rounded-full px-2 py-0.5 ml-2" style={{ background: T.goldSoft, color: T.gold, fontSize: 10 }}>Ya registrado</span>}
                      {r.error && <span className="rounded-full px-2 py-0.5 ml-2" style={{ background: T.coralSoft, color: T.coral, fontSize: 10 }}>{r.error} (fila {r.line})</span>}
                    </p>
                    {!r.error && (
                      <select aria-label={`Categoría fila ${r.line}`} style={{ ...inputStyle, marginTop: 6, padding: '6px 8px', fontSize: 12.5 }} value={r.categoryId || ''} onChange={(e) => patchRow(i, { categoryId: e.target.value })}>
                        {data.categories.filter((c) => c.type === r.type).map((c) => <option key={c.id} value={c.id}>{c.name}{r.suggested && c.id === r.categoryId ? ' (sugerida)' : ''}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
          <div className="flex gap-2">
            <GhostButton onClick={() => setStep(2)} style={{ flex: 1 }}>Atrás</GhostButton>
            <PrimaryButton onClick={doImport} style={{ flex: 2, opacity: summary.selected && !busy ? 1 : 0.5 }}>{busy ? 'Importando…' : `Importar ${summary.selected} movimientos`}</PrimaryButton>
          </div>
        </>
      )}
    </div>
  );
}
