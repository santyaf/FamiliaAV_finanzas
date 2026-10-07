import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Coins, Bitcoin, LineChart, Plus, Search, Trash2, ChevronLeft, TrendingUp, TrendingDown, Minus, Archive } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, Modal, PrimaryButton, GhostButton, IconButton, Field, EmptyState } from '../ui/primitives';
import { Sparkline } from '../components/Sparkline';
import { formatMoney, formatDate } from '../lib/format';
import { todayISO } from '../lib/finance';
import {
  ASSET_CLASSES, assetClassInfo, computePosition, summarizePortfolio, validateTrade, canDeleteTrade, activeUsdRate,
  FX_SOURCE_LABELS, fxOpportunity, technicalTrend, priceInCop,
} from '../lib/portfolio';
import { fetchMarket, marketErrorText } from '../lib/market';
import { STOCK_CATALOG, searchStocks, customStock, stockLabel } from '../lib/marketCatalog';

const nf = (max, min = 0) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: min, maximumFractionDigits: max });
const fmtUnits = (n, max = 8) => nf(max).format(n);
const fmtUsd = (n) => `US$ ${nf(2, 2).format(n)}`;
const fmtPct = (n) => `${n >= 0 ? '+' : '−'}${nf(2, 2).format(Math.abs(n))} %`;
const CLASS_ICON = { divisa: Coins, cripto: Bitcoin, accion: LineChart };
const tone = (n) => (n > 0 ? T.teal : n < 0 ? T.coral : T.inkSoft);

function Pill({ active, children, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} aria-label={label} className="flex-shrink-0 rounded-full px-3 py-1.5"
      style={{ background: active ? T.ink : T.surface, border: `1px solid ${active ? T.ink : T.border}` }}>
      <span style={{ fontSize: 12.5, color: active ? T.surface : T.inkSoft, fontFamily: FONT_BODY, fontWeight: active ? 600 : 400 }}>{children}</span>
    </button>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div className="min-w-0">
      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>{label}</p>
      <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 14.5, color: color || T.ink }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: color || T.inkSoft, fontFamily: FONT_MONO }}>{sub}</p>}
    </div>
  );
}

/* ---------------- Operación (compra o venta) ---------------- */
function TradeModal({ ctx, dialog, onClose }) {
  const { data, actions, tradesBy, trmValue, reload, store } = ctx;
  const existing = dialog.holdingId ? store.holdings.find((h) => h.id === dialog.holdingId) : null;
  const holdingDef = existing || dialog.newHolding;
  const cls = assetClassInfo(holdingDef.assetClass);
  const [side, setSide] = useState(dialog.side || 'compra');
  const [date, setDate] = useState(todayISO());
  const [cop, setCop] = useState('');
  const [units, setUnits] = useState('');
  const [accountId, setAccountId] = useState('');
  const [memberId, setMemberId] = useState(actions.userId);
  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState('yo');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const trades = existing ? tradesBy[existing.id] || [] : [];
  const held = computePosition(trades.filter((t) => t.date <= todayISO())).units;
  const copN = parseFloat(cop); const unitsN = parseFloat(units);
  const unitPrice = copN > 0 && unitsN > 0 ? copN / unitsN : null;
  const isBuy = side === 'compra';

  async function save() {
    const trade = { side, date, units: unitsN, cop: copN };
    const problem = validateTrade(trade, trades, { todayISO: todayISO() });
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try {
      let holdingId = existing?.id;
      if (!holdingId) {
        holdingId = await actions.ensureHolding({ ...dialog.newHolding, ownerMemberId: visibility === 'yo' ? actions.userId : null });
      }
      await actions.addHoldingTrade({
        holdingId, holdingName: holdingDef.name, date, side, units: unitsN, cop: copN,
        fxRate: holdingDef.assetClass === 'divisa' ? copN / unitsN : trmValue || null,
        accountId: accountId || null, memberId, note,
      });
      await reload();
      onClose(holdingId);
    } catch (e) { setError(e.message || 'No se pudo guardar la operación.'); } finally { setSaving(false); }
  }

  return (
    <Modal title={`${isBuy ? 'Comprar' : 'Vender'} · ${holdingDef.name}`} onClose={() => onClose()}>
      <div className="flex rounded-xl p-1 mb-3" style={{ background: T.bg }} role="group" aria-label="Tipo de operación">
        {[['compra', 'Compra'], ['venta', 'Venta']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setSide(id); setError(''); }} aria-pressed={side === id} className="flex-1 rounded-lg py-2"
            style={{ background: side === id ? T.surface : 'transparent', fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: side === id ? 600 : 400, color: side === id ? T.ink : T.inkSoft }}>{label}</button>
        ))}
      </div>
      {!isBuy && existing && <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Disponible para vender: {fmtUnits(held, cls.maxDecimals)} {cls.unit || cls.unitLabel}</p>}
      <Field label="Fecha de la operación"><input style={inputStyle} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} aria-label="Fecha de la operación" /></Field>
      <Field label={isBuy ? 'Pesos invertidos (COP)' : 'Pesos recibidos (COP)'}><input style={inputStyle} inputMode="decimal" value={cop} onChange={(e) => setCop(e.target.value)} placeholder="Ej. 500000" aria-label="Pesos de la operación" /></Field>
      <Field label={`${isBuy ? 'Recibido' : 'Vendido'} (${cls.unit || cls.unitLabel})`}><input style={inputStyle} inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} placeholder={cls.id === 'divisa' ? 'Ej. 121,50' : 'Ej. 0,0123'} aria-label="Unidades de la operación" /></Field>
      <div className="rounded-xl p-3 mb-3" style={{ background: T.bg }}>
        <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{cls.id === 'divisa' ? 'Tasa de esta operación' : 'Precio de esta operación'}: <b style={{ fontFamily: FONT_MONO, color: T.ink }}>{unitPrice ? `${formatMoney(unitPrice, data.currency)}${cls.id === 'divisa' ? ' / USD' : ''}` : '—'}</b></p>
        {cls.id !== 'divisa' && trmValue > 0 && copN > 0 && <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Equivale a {fmtUsd(copN / trmValue)} a la TRM de hoy.</p>}
      </div>
      {!existing && (
        <Field label="¿Quién la ve?">
          <select style={inputStyle} value={visibility} onChange={(e) => setVisibility(e.target.value)} aria-label="Quién ve esta posición">
            <option value="yo">Solo yo</option>
            <option value="hogar">Todo el hogar</option>
          </select>
        </Field>
      )}
      <Field label={isBuy ? 'Se paga desde (opcional)' : 'El dinero entra a (opcional)'}>
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Cuenta de la operación">
          <option value="">No mover dinero de una cuenta</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {accountId && (
        <>
          <Field label="A nombre de">
            <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="A nombre de">
              {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Se registra un {isBuy ? 'gasto' : 'ingreso'} de inversión en esa cuenta; no cuenta como gasto operativo.</p>
        </>
      )}
      <Field label="Nota (opcional)"><input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Wenia, Bancolombia…" /></Field>
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : isBuy ? 'Guardar compra' : 'Guardar venta'}</PrimaryButton>
    </Modal>
  );
}

/* ---------------- Elegir qué seguir (cripto o acción) ---------------- */
function PickerModal({ ctx, assetClass, onClose }) {
  const { market, actions, reload, ensureCrypto } = ctx;
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('yo');
  const [customSymbol, setCustomSymbol] = useState('');
  const [customExchange, setCustomExchange] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (assetClass === 'cripto') ensureCrypto(); }, [assetClass]);

  const q = query.trim().toLowerCase();
  const cryptoList = (market.crypto || []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)).slice(0, 60);
  const stockList = searchStocks(query);

  async function follow(def) {
    setBusy(true); setError('');
    try {
      const id = await actions.ensureHolding({ ...def, ownerMemberId: visibility === 'yo' ? actions.userId : null });
      await reload();
      onClose(id);
    } catch (e) { setError(e.message || 'No se pudo agregar.'); } finally { setBusy(false); }
  }
  function followCustom() {
    const r = customStock(customSymbol, customExchange);
    if (r.error) { setError(r.error); return; }
    follow({ assetClass: 'accion', symbol: r.stock.symbol, name: r.stock.name, exchange: r.stock.exchange, quoteCurrency: r.stock.quoteCurrency });
  }

  return (
    <Modal title={assetClass === 'cripto' ? 'Seguir un criptoactivo' : 'Seguir una acción'} onClose={() => onClose()}>
      <Field label="¿Quién la ve?">
        <select style={inputStyle} value={visibility} onChange={(e) => setVisibility(e.target.value)} aria-label="Quién ve esta posición">
          <option value="yo">Solo yo</option>
          <option value="hogar">Todo el hogar</option>
        </select>
      </Field>
      <div className="relative mb-2">
        <Search size={14} color={T.inkSoft} style={{ position: 'absolute', left: 12, top: 14 }} />
        <input style={{ ...inputStyle, paddingLeft: 32 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o símbolo…" aria-label="Buscar" />
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto' }} className="mb-3">
        {assetClass === 'cripto' && !market.crypto && !market.cryptoError && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Cargando criptoactivos…</p>}
        {market.cryptoError && <p role="alert" style={{ fontSize: 12.5, color: T.danger }}>{market.cryptoError}</p>}
        {assetClass === 'cripto' && cryptoList.map((c) => (
          <button key={c.id} type="button" disabled={busy} onClick={() => follow({ assetClass: 'cripto', symbol: c.id, name: `${c.name} (${c.symbol})`, quoteCurrency: 'USD' })}
            className="w-full flex items-center gap-2 py-2 text-left" style={{ borderBottom: `1px solid ${T.border}` }}>
            {c.image && <img src={c.image} alt="" width={20} height={20} style={{ borderRadius: 10 }} />}
            <span className="flex-1" style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>{c.name} <span style={{ color: T.inkSoft, fontSize: 11.5 }}>{c.symbol}</span></span>
            <span style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_MONO }}>#{c.rank}</span>
          </button>
        ))}
        {assetClass === 'accion' && stockList.map((s) => (
          <button key={`${s.exchange}:${s.symbol}`} type="button" disabled={busy} onClick={() => follow({ assetClass: 'accion', symbol: s.symbol, name: s.name, exchange: s.exchange, quoteCurrency: s.quoteCurrency })}
            className="w-full flex items-center gap-2 py-2 text-left" style={{ borderBottom: `1px solid ${T.border}` }}>
            <span className="flex-1" style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>{s.name} <span style={{ color: T.inkSoft, fontSize: 11.5 }}>{s.symbol}</span></span>
            <span style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }}>{s.exchange}</span>
          </button>
        ))}
        {assetClass === 'accion' && stockList.length === 0 && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Sin resultados. Puedes agregar un símbolo a mano abajo.</p>}
      </div>
      {assetClass === 'accion' && (
        <div className="rounded-xl p-3 mb-3" style={{ background: T.bg }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: FONT_BODY }} className="mb-2">¿No está en la lista?</p>
          <div className="flex gap-2">
            <input style={{ ...inputStyle, flex: 2 }} value={customSymbol} onChange={(e) => setCustomSymbol(e.target.value)} placeholder="Símbolo" aria-label="Símbolo" />
            <input style={{ ...inputStyle, flex: 1 }} value={customExchange} onChange={(e) => setCustomExchange(e.target.value)} placeholder="Bolsa" aria-label="Bolsa" />
            <GhostButton onClick={followCustom} aria-label="Agregar símbolo">Agregar</GhostButton>
          </div>
        </div>
      )}
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }}>{error}</p>}
    </Modal>
  );
}

/* ---------------- Historial de operaciones ---------------- */
function TradeTable({ ctx, holding }) {
  const { tradesBy, money, actions, reload } = ctx;
  const trades = tradesBy[holding.id] || [];
  const pos = computePosition(trades);
  const cls = assetClassInfo(holding.assetClass);
  const rows = [...pos.rows].reverse();
  const [error, setError] = useState('');
  async function remove(t) {
    setError('');
    try { await actions.deleteHoldingTrade(t); await reload(); } catch (e) { setError(e.message || 'No se pudo borrar.'); }
  }
  if (!rows.length) return <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Aún no hay operaciones.</p>;
  return (
    <div>
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mb-2">{error}</p>}
      {rows.map((t) => {
        const removable = canDeleteTrade(trades, t.id);
        return (
          <div key={t.id} className="flex items-start justify-between gap-2 py-2" style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="min-w-0">
              <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>
                <span style={{ fontWeight: 600, color: t.side === 'compra' ? T.teal : T.amber }}>{t.side === 'compra' ? 'Compra' : 'Venta'}</span> · {formatDate(t.date)}
              </p>
              <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_MONO }}>{fmtUnits(t.units, cls.maxDecimals)} {cls.unit} a {money(t.unitPrice)}{t.transactionId ? ' · en tu cuenta' : ''}</p>
              {t.side === 'venta' && <p style={{ fontSize: 11.5, color: tone(t.gain), fontFamily: FONT_MONO }}>Resultado {t.gain >= 0 ? '+' : '−'}{money(Math.abs(t.gain))}{t.gainPct != null ? ` (${fmtPct(t.gainPct)})` : ''}</p>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span style={{ fontFamily: FONT_MONO, fontWeight: 600, fontSize: 13, color: T.ink }}>{money(t.cop)}</span>
              <IconButton icon={Trash2} variant="danger" size={14} label="Eliminar operación" onClick={() => (removable ? remove(t) : Promise.reject(new Error('Esa compra ya respalda ventas posteriores: borra primero esas ventas.')))}
                confirmMessage={t.transactionId ? '¿Eliminar esta operación? También se borra el movimiento que creó en tu cuenta.' : '¿Eliminar esta operación?'} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Divisas (dólar) ---------------- */
function DivisasPanel({ ctx }) {
  const { store, market, money, tradesBy, usdRate, actions, reload, setDialog, saveSettings } = ctx;
  const usd = store.holdings.filter((h) => h.assetClass === 'divisa' && !h.archived);
  const [pickId, setPickId] = useState(usd[0]?.id || null);
  const holding = usd.find((h) => h.id === pickId) || usd[0] || null;
  const pos = computePosition(holding ? tradesBy[holding.id] || [] : [], usdRate.rate);
  const trm = market.trm;
  const opp = fxOpportunity(pos.avgCost, pos.units, trm?.value);
  const [wBuy, setWBuy] = useState(store.settings.weniaBuy ?? '');
  const [wSell, setWSell] = useState(store.settings.weniaSell ?? '');
  const settings = store.settings;
  const newUsd = { assetClass: 'divisa', symbol: 'USD', name: 'Dólares (USD)', quoteCurrency: 'USD' };
  const openTrade = (side) => setDialog(holding ? { type: 'trade', holdingId: holding.id, side } : { type: 'trade', newHolding: newUsd, side });

  return (
    <div>
      <Card style={{ marginBottom: 12, background: T.inverse, border: 'none' }}>
        <p style={{ fontSize: 11, color: T.onInverse, opacity: 0.7, fontFamily: FONT_BODY, letterSpacing: '0.08em' }}>TASA ACTIVA DE VENTA</p>
        <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 28, color: T.onInverse }}>{usdRate.rate ? `${nf(2, 2).format(usdRate.rate)} ` : '—'}<span style={{ fontSize: 13, opacity: 0.7 }}>COP / USD</span></p>
        <p style={{ fontSize: 12, color: T.onInverse, opacity: 0.8, fontFamily: FONT_BODY }}>{FX_SOURCE_LABELS[usdRate.source]}</p>
        {market.trmError && <p role="alert" style={{ fontSize: 12, color: T.onInverse }} className="mt-1">{market.trmError}</p>}
        {trm && <p style={{ fontSize: 11.5, color: T.onInverse, opacity: 0.7, fontFamily: FONT_BODY }}>TRM vigente: {nf(2, 2).format(trm.value)} · {formatDate(trm.date)}</p>}
        <div className="flex gap-2 mt-3" role="group" aria-label="Fuente de la tasa">
          <Pill active={settings.fxSource === 'trm'} onClick={() => saveSettings({ fxSource: 'trm' })}>TRM · Banco de la República</Pill>
          <Pill active={settings.fxSource === 'wenia'} onClick={() => saveSettings({ fxSource: 'wenia' })}>Wenia (manual)</Pill>
        </div>
      </Card>

      {settings.fxSource === 'wenia' && (
        <Card style={{ marginBottom: 12 }}>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-1">Tasas de Wenia</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Wenia no publica una API abierta: escribe aquí sus tasas a mano.</p>
          <div className="flex gap-2">
            <Field label="Compra (tú compras USD)"><input style={inputStyle} inputMode="decimal" value={wBuy} onChange={(e) => setWBuy(e.target.value)} onBlur={() => saveSettings({ weniaBuy: parseFloat(wBuy) || null })} aria-label="Tasa de compra de Wenia" /></Field>
            <Field label="Venta (tú vendes USD)"><input style={inputStyle} inputMode="decimal" value={wSell} onChange={(e) => setWSell(e.target.value)} onBlur={() => saveSettings({ weniaSell: parseFloat(wSell) || null })} aria-label="Tasa de venta de Wenia" /></Field>
          </div>
        </Card>
      )}

      {usd.length > 1 && (
        <div className="flex gap-2 mb-3 overflow-x-auto">
          {usd.map((h) => <Pill key={h.id} active={holding?.id === h.id} onClick={() => setPickId(h.id)}>{h.ownerMemberId ? 'Solo tuya' : 'Del hogar'}</Pill>)}
        </div>
      )}

      <Card style={{ marginBottom: 12 }}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Dólares disponibles" value={pos.units > 0 ? fmtUsd(pos.units) : '—'} sub={pos.avgCost ? `Tasa promedio ${nf(2, 2).format(pos.avgCost)}` : undefined} />
          <Stat label="Valor si vendes hoy" value={pos.marketValue != null ? money(pos.marketValue) : '—'} />
          <Stat label="Invertido (costo)" value={pos.cost > 0 ? money(pos.cost) : '—'} />
          <Stat label="Resultado no realizado" value={pos.unrealized != null ? `${pos.unrealized >= 0 ? '+' : '−'}${money(Math.abs(pos.unrealized))}` : '—'} sub={pos.unrealizedPct != null ? fmtPct(pos.unrealizedPct) : undefined} color={pos.unrealized != null ? tone(pos.unrealized) : undefined} />
        </div>
        {pos.rows.some((r) => r.side === 'venta') && <p style={{ fontSize: 12, color: tone(pos.realized), fontFamily: FONT_MONO }} className="mt-2">Realizado en ventas: {pos.realized >= 0 ? '+' : '−'}{money(Math.abs(pos.realized))}</p>}
        <div className="flex gap-2 mt-3">
          <PrimaryButton onClick={() => openTrade('compra')} style={{ flex: 1 }}>Registrar compra</PrimaryButton>
          <GhostButton onClick={() => openTrade('venta')} style={{ flex: 1 }} disabled={!holding || pos.units <= 0}>Registrar venta</GhostButton>
        </div>
      </Card>

      {opp && (
        <Card style={{ marginBottom: 12, background: opp.above ? T.tealSoft : T.amberSoft, border: 'none' }} role="status">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: opp.above ? T.teal : T.amber }}>{opp.above ? 'La TRM está por encima de tu tasa promedio de compra' : 'La TRM aún está por debajo de tu tasa promedio'}</p>
          <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>
            TRM {nf(2, 2).format(trm.value)} contra tu promedio {nf(2, 2).format(pos.avgCost)}: {opp.diff >= 0 ? '+' : '−'}{nf(2, 2).format(Math.abs(opp.diff))} por dólar ({fmtPct(opp.pct)}).
            {opp.above ? ` Si vendieras hoy a TRM, ganarías unos ${money(opp.potentialGain)}.` : ` Te faltan ${nf(2, 2).format(Math.abs(opp.diff))} por dólar para el punto de equilibrio.`}
          </p>
        </Card>
      )}

      <Card style={{ marginBottom: 12 }}>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={settings.fxAlert} onChange={(e) => saveSettings({ fxAlert: e.target.checked })} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>Avisarme con una notificación cuando la TRM supere mi tasa promedio <span style={{ color: T.inkSoft }}>(máximo una por día, aunque tengas la app cerrada)</span></span>
        </label>
        <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">Necesitas tener activadas las notificaciones push en Ajustes.</p>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">TRM · últimos 30 días</p>
        {trm ? <Sparkline series={trm.series} refValue={pos.avgCost || undefined} refLabel="Tu tasa promedio" label="TRM" format={(n) => nf(0).format(n)} /> : <p style={{ fontSize: 12.5, color: T.inkSoft }}>{market.trmError || 'Consultando la TRM…'}</p>}
      </Card>

      <Card>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Historial de operaciones</p>
        {holding ? <TradeTable ctx={ctx} holding={holding} /> : <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Aún no hay operaciones. Registra tu primera compra de dólares.</p>}
      </Card>
    </div>
  );
}

/* ---------------- Cripto y acciones: lista y detalle ---------------- */
function HoldingCard({ ctx, holding, onOpen }) {
  const { money, tradesBy, priceOf } = ctx;
  const cls = assetClassInfo(holding.assetClass);
  const price = priceOf(holding);
  const pos = computePosition(tradesBy[holding.id] || [], price);
  return (
    <button type="button" onClick={onOpen} className="w-full text-left rounded-2xl p-4 mb-3" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5, color: T.ink }}>{holding.name}</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{holding.ownerMemberId ? 'Solo tuya' : 'Del hogar'}{holding.exchange ? ` · ${holding.exchange}` : ''}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 14, color: T.ink }}>{pos.marketValue != null ? money(pos.marketValue) : pos.units > 0 ? money(pos.cost) : '—'}</p>
          {pos.unrealized != null && <p style={{ fontSize: 11.5, color: tone(pos.unrealized), fontFamily: FONT_MONO }}>{pos.unrealized >= 0 ? '+' : '−'}{money(Math.abs(pos.unrealized))} ({fmtPct(pos.unrealizedPct)})</p>}
        </div>
      </div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_MONO }} className="mt-1">
        {pos.units > 0 ? `${fmtUnits(pos.units, cls.maxDecimals)} ${cls.id === 'accion' ? 'acciones' : ''} · costo prom. ${money(pos.avgCost)}` : 'Sin posición'}
        {price == null && pos.units > 0 ? ' · sin precio, valorada a su costo' : ''}
      </p>
    </button>
  );
}

function HoldingDetail({ ctx, holding, onBack }) {
  const { money, tradesBy, priceOf, market, quotes, trmValue, setDialog, actions, reload } = ctx;
  const cls = assetClassInfo(holding.assetClass);
  const price = priceOf(holding);
  const pos = computePosition(tradesBy[holding.id] || [], price);
  const [series, setSeries] = useState(null);
  const [seriesError, setSeriesError] = useState('');
  const [actionError, setActionError] = useState('');
  const quote = quotes[holding.id];
  const crypto = holding.assetClass === 'cripto' ? (market.crypto || []).find((c) => c.id === holding.symbol) : null;

  useEffect(() => {
    let off = false;
    if (holding.assetClass === 'cripto') {
      fetchMarket('crypto_history', { id: holding.symbol, days: '30' })
        .then((r) => { if (!off) setSeries(r.series); })
        .catch((e) => { if (!off) setSeriesError(marketErrorText(e)); });
    }
    return () => { off = true; };
  }, [holding.id]);

  const usdSeries = holding.assetClass === 'cripto' ? series : quote?.series || null;
  const nativeCurrency = holding.assetClass === 'cripto' ? 'USD' : quote?.currency || holding.quoteCurrency;
  const copSeries = usdSeries && trmValue != null
    ? usdSeries.map((p) => ({ date: p.date, value: priceInCop(p.value, nativeCurrency, trmValue) })).filter((p) => p.value != null)
    : null;
  const trend = copSeries ? technicalTrend(copSeries) : null;
  const change = holding.assetClass === 'cripto' ? crypto?.change24h : quote?.changePct;
  const nativePrice = holding.assetClass === 'cripto' ? crypto?.price : quote?.price;

  async function run(fn) { setActionError(''); try { await fn(); } catch (e) { setActionError(e.message || 'No se pudo completar.'); } }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 mb-3"><ChevronLeft size={16} color={T.inkSoft} /><span style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }}>{cls.label}</span></button>
      <Card style={{ marginBottom: 12, background: T.inverse, border: 'none' }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.onInverse }}>{holding.name}</p>
        <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 26, color: T.onInverse }}>{price != null ? money(price) : '—'}</p>
        <p style={{ fontSize: 12, color: T.onInverse, opacity: 0.8, fontFamily: FONT_BODY }}>
          {nativePrice != null ? `${nativeCurrency || ''} ${nf(4).format(nativePrice)} por unidad` : 'Sin precio en vivo'}
          {change != null ? ` · ${fmtPct(change)} ${holding.assetClass === 'cripto' ? '(24 h)' : '(día)'}` : ''}
        </p>
        {quote?.error && <p role="alert" style={{ fontSize: 12, color: T.onInverse }} className="mt-1">{quote.error}</p>}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Tu posición" value={pos.units > 0 ? fmtUnits(pos.units, cls.maxDecimals) : 'Sin posición'} sub={pos.avgCost ? `Costo prom. ${money(pos.avgCost)}` : undefined} />
          <Stat label="Valor de mercado" value={pos.marketValue != null ? money(pos.marketValue) : '—'} />
          <Stat label="Invertido (costo)" value={pos.cost > 0 ? money(pos.cost) : '—'} />
          <Stat label="No realizado" value={pos.unrealized != null ? `${pos.unrealized >= 0 ? '+' : '−'}${money(Math.abs(pos.unrealized))}` : '—'} sub={pos.unrealizedPct != null ? fmtPct(pos.unrealizedPct) : undefined} color={pos.unrealized != null ? tone(pos.unrealized) : undefined} />
        </div>
        {pos.rows.some((r) => r.side === 'venta') && <p style={{ fontSize: 12, color: tone(pos.realized), fontFamily: FONT_MONO }} className="mt-2">Realizado en ventas: {pos.realized >= 0 ? '+' : '−'}{money(Math.abs(pos.realized))}</p>}
        <div className="flex gap-2 mt-3">
          <PrimaryButton onClick={() => setDialog({ type: 'trade', holdingId: holding.id, side: 'compra' })} style={{ flex: 1 }}>Registrar compra</PrimaryButton>
          <GhostButton onClick={() => setDialog({ type: 'trade', holdingId: holding.id, side: 'venta' })} style={{ flex: 1 }} disabled={pos.units <= 0}>Registrar venta</GhostButton>
        </div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Evolución · últimos 30 días</p>
        {copSeries ? <Sparkline series={copSeries} refValue={pos.avgCost || undefined} refLabel="Tu costo promedio" label={holding.name} format={(n) => nf(0).format(n)} />
          : <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{seriesError || (trmValue == null ? 'Esperando la TRM para convertir a pesos…' : 'Cargando…')}</p>}
        {holding.assetClass === 'accion' && nativeCurrency && nativeCurrency !== 'COP' && <p style={{ fontSize: 11, color: T.inkSoft }} className="mt-1">Los precios en {nativeCurrency} se convierten a pesos con la TRM de hoy.</p>}
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Tendencia técnica <span style={{ fontWeight: 400, fontSize: 11.5, color: T.inkSoft }}>lectura del pasado, no una predicción</span></p>
        {trend ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-2">
              {trend.v1 != null && <Stat label={holding.assetClass === 'cripto' ? 'Variación 24 h' : 'Variación del día'} value={fmtPct(trend.v1)} color={tone(trend.v1)} />}
              <Stat label="Variación 7 días" value={fmtPct(trend.v7)} color={tone(trend.v7)} />
              <Stat label="Variación 30 días" value={fmtPct(trend.v30)} color={tone(trend.v30)} />
              <Stat label="Volatilidad diaria" value={`${nf(2, 2).format(trend.vol)} %`} />
            </div>
            <p role="status" className="flex items-center gap-2" style={{ fontSize: 12.5, color: trend.signal === 'alcista' ? T.teal : trend.signal === 'bajista' ? T.coral : T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600 }}>
              {trend.signal === 'alcista' ? <TrendingUp size={15} /> : trend.signal === 'bajista' ? <TrendingDown size={15} /> : <Minus size={15} />}{trend.text}
            </p>
          </>
        ) : <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Aún no hay suficientes datos históricos.</p>}
        <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY, borderTop: `1px dashed ${T.border}` }} className="mt-2 pt-2">Compara el promedio de 7 días con el de 30 sobre precios reales: es un indicador de momentum, no una recomendación de inversión. Tu decisión depende de tu perfil de riesgo; esto no reemplaza asesoría financiera.</p>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-2">Historial de operaciones</p>
        <TradeTable ctx={ctx} holding={holding} />
      </Card>

      {actionError && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mb-2">{actionError}</p>}
      <div className="flex gap-2">
        <GhostButton onClick={() => run(async () => { await actions.setHoldingArchived(holding.id, true); await reload(); onBack(); })} style={{ flex: 1, fontSize: 12.5 }}><Archive size={13} style={{ display: 'inline', marginRight: 4 }} />Archivar</GhostButton>
        <GhostButton onClick={() => { if (confirm(`¿Dejar de seguir ${holding.name}? Se borran sus operaciones del portafolio (los movimientos que hayan creado en tus cuentas se quedan).`)) run(async () => { await actions.deleteHolding(holding.id); await reload(); onBack(); }); }} style={{ flex: 1, fontSize: 12.5, color: T.danger }}>Dejar de seguir</GhostButton>
      </div>
    </div>
  );
}

function HoldingsPanel({ ctx, assetClass }) {
  const { store, selectedId, setSelectedId, setDialog, market } = ctx;
  const cls = assetClassInfo(assetClass);
  const [showArchived, setShowArchived] = useState(false);
  const mine = store.holdings.filter((h) => h.assetClass === assetClass);
  const active = mine.filter((h) => !h.archived);
  const archived = mine.filter((h) => h.archived);
  const selected = mine.find((h) => h.id === selectedId);
  if (selected) return <HoldingDetail ctx={ctx} holding={selected} onBack={() => setSelectedId(null)} />;
  return (
    <div>
      {assetClass === 'accion' && market.stocksEnabled === false && (
        <Card style={{ marginBottom: 12, background: T.amberSoft, border: 'none' }} role="status">
          <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>Los precios de acciones aún no están activados: falta que el administrador configure la clave gratuita de Twelve Data en Vercel (variable <b>TWELVE_DATA_API_KEY</b>). Mientras tanto puedes registrar tus compras y ventas; se valoran a su costo.</p>
        </Card>
      )}
      <PrimaryButton full onClick={() => setDialog({ type: 'picker', assetClass })} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus size={16} /> {assetClass === 'cripto' ? 'Agregar criptoactivo' : 'Agregar acción'}</PrimaryButton>
      {active.length === 0 && <EmptyState icon={React.createElement(CLASS_ICON[assetClass], { size: 32, color: T.inkSoft })} title={`Aún no sigues ${cls.label.toLowerCase()}`} subtitle="Elige uno de la lista, registra tus compras y ventas, y verás su costo promedio y su resultado." />}
      {active.map((h) => <HoldingCard key={h.id} ctx={ctx} holding={h} onOpen={() => setSelectedId(h.id)} />)}
      {archived.length > 0 && (
        <>
          <button onClick={() => setShowArchived(!showArchived)} className="mb-2"><span style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{showArchived ? 'Ocultar' : 'Ver'} archivadas ({archived.length})</span></button>
          {showArchived && archived.map((h) => (
            <div key={h.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{h.name}</span>
              <GhostButton onClick={async () => { await ctx.actions.setHoldingArchived(h.id, false); await ctx.reload(); }} style={{ padding: '4px 10px', fontSize: 12 }}>Reactivar</GhostButton>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------------- Pantalla ---------------- */
// Activos → Mercados: divisas (dólar), criptoactivos y acciones con costo promedio, resultado y precios en vivo.
export function Mercados({ data, actions }) {
  const [store, setStore] = useState(null);
  const [error, setError] = useState('');
  const [market, setMarket] = useState({ trm: null, trmError: '', crypto: null, cryptoError: '', stocksEnabled: null });
  const [quotes, setQuotes] = useState({});
  const [tab, setTab] = useState('divisa');
  const [selectedId, setSelectedId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const savedPrices = useRef(new Set());
  const cryptoAsked = useRef(false);
  const money = useCallback((n) => formatMoney(n, data.currency), [data.currency]);

  const reload = useCallback(async () => {
    try { setStore(await actions.loadPortfolio()); setError(''); } catch (e) { setError(e.message || 'No se pudo cargar el portafolio.'); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    fetchMarket('trm').then((trm) => setMarket((m) => ({ ...m, trm, trmError: '' }))).catch((e) => setMarket((m) => ({ ...m, trmError: marketErrorText(e) })));
    fetchMarket('status').then((s) => setMarket((m) => ({ ...m, stocksEnabled: !!s.stocks }))).catch(() => {});
  }, []);

  const ensureCrypto = useCallback(() => {
    if (cryptoAsked.current) return;
    cryptoAsked.current = true;
    fetchMarket('crypto_markets').then((crypto) => setMarket((m) => ({ ...m, crypto, cryptoError: '' })))
      .catch((e) => { cryptoAsked.current = false; setMarket((m) => ({ ...m, cryptoError: marketErrorText(e) })); });
  }, []);
  useEffect(() => { if (store && (tab === 'cripto' || store.holdings.some((h) => h.assetClass === 'cripto' && !h.archived))) ensureCrypto(); }, [store, tab]);

  useEffect(() => {
    if (!store || !market.stocksEnabled) return;
    const todo = store.holdings.filter((h) => h.assetClass === 'accion' && !h.archived && !quotes[h.id]).slice(0, 8);
    let off = false;
    (async () => {
      for (const h of todo) {
        try {
          const q = await fetchMarket('stock', { symbol: h.symbol, ...(h.exchange ? { exchange: h.exchange } : {}) });
          if (!off) setQuotes((cur) => ({ ...cur, [h.id]: q }));
        } catch (e) { if (!off) setQuotes((cur) => ({ ...cur, [h.id]: { error: marketErrorText(e) } })); }
      }
    })();
    return () => { off = true; };
  }, [store, market.stocksEnabled]);

  const trmValue = market.trm?.value ?? null;
  const usdRate = activeUsdRate(store?.settings, trmValue);
  const tradesBy = useMemo(() => {
    const by = {};
    (store?.trades || []).forEach((t) => { (by[t.holdingId] ||= []).push({ ...t, cop: t.cop }); });
    return by;
  }, [store]);
  const storedPrice = useCallback((h) => {
    const list = (store?.prices || []).filter((p) => p.holdingId === h.id).sort((a, b) => a.date.localeCompare(b.date));
    return list.length ? list[list.length - 1].priceCop : null;
  }, [store]);
  const livePrice = useCallback((h) => {
    if (h.assetClass === 'divisa') return usdRate.rate;
    if (h.assetClass === 'cripto') { const c = (market.crypto || []).find((x) => x.id === h.symbol); return c && trmValue ? c.price * trmValue : null; }
    const q = quotes[h.id];
    return q && !q.error ? priceInCop(q.price, q.currency || h.quoteCurrency, trmValue) : null;
  }, [usdRate.rate, market.crypto, quotes, trmValue]);
  const priceOf = useCallback((h) => livePrice(h) ?? storedPrice(h), [livePrice, storedPrice]);

  // el precio del día queda guardado: así el patrimonio puede valorar el portafolio aunque no abras esta pantalla
  useEffect(() => {
    if (!store) return;
    const today = todayISO();
    const rows = [];
    store.holdings.filter((h) => !h.archived).forEach((h) => {
      const p = livePrice(h);
      const key = `${h.id}:${today}`;
      if (p != null && !savedPrices.current.has(key)) { savedPrices.current.add(key); rows.push({ holdingId: h.id, date: today, priceCop: Math.round(p * 100) / 100 }); }
    });
    if (rows.length) actions.saveHoldingPrices(rows).catch(() => rows.forEach((r) => savedPrices.current.delete(`${r.holdingId}:${r.date}`)));
  }, [store, livePrice]);

  const saveSettings = useCallback(async (patch) => {
    const next = { ...store.settings, ...patch };
    setStore((s) => ({ ...s, settings: next }));
    try { await actions.saveInvestmentSettings(next); } catch (e) { setError(e.message || 'No se pudo guardar.'); await reload(); }
  }, [store, reload]);

  if (error && !store) return <p role="alert" style={{ color: T.danger, fontSize: 13 }} className="pt-2">{error}</p>;
  if (!store) return null;

  const active = store.holdings.filter((h) => !h.archived);
  const summary = summarizePortfolio(active, tradesBy, Object.fromEntries(active.map((h) => [h.id, priceOf(h)])));
  const ctx = { data, actions, store, market, quotes, money, tradesBy, priceOf, usdRate, trmValue, reload, setDialog, selectedId, setSelectedId, saveSettings, ensureCrypto };
  const hasAny = summary.items.some((i) => i.position.units > 0 || i.position.rows.length);

  return (
    <div>
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mb-2">{error}</p>}
      {hasAny && (
        <Card style={{ marginBottom: 12, background: T.inverse, border: 'none' }}>
          <p style={{ fontSize: 12, color: T.onInverse, opacity: 0.75, fontFamily: FONT_BODY }}>Tu portafolio de mercados hoy</p>
          <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 24, color: T.onInverse }}>{money(summary.value)}</p>
          <p style={{ fontSize: 12, color: T.onInverse, opacity: 0.85, fontFamily: FONT_MONO }}>Invertido {money(summary.cost)} · {summary.unrealized >= 0 ? '+' : '−'}{money(Math.abs(summary.unrealized))}{summary.unrealizedPct != null ? ` (${fmtPct(summary.unrealizedPct)})` : ''}</p>
          <div className="flex gap-3 flex-wrap mt-1">
            {ASSET_CLASSES.filter((c) => summary.byClass[c.id]).map((c) => <span key={c.id} style={{ fontSize: 11, color: T.onInverse, opacity: 0.75 }}>{c.label} {money(summary.byClass[c.id].value)}</span>)}
            {summary.realized !== 0 && <span style={{ fontSize: 11, color: T.onInverse, opacity: 0.75 }}>Realizado {summary.realized >= 0 ? '+' : '−'}{money(Math.abs(summary.realized))}</span>}
          </div>
          {summary.missingPrice > 0 && <p style={{ fontSize: 11, color: T.onInverse, opacity: 0.7 }} className="mt-1">{summary.missingPrice === 1 ? 'Una posición sin precio se valora' : `${summary.missingPrice} posiciones sin precio se valoran`} a su costo.</p>}
        </Card>
      )}

      <div className="flex gap-2 mb-3 overflow-x-auto" role="tablist" aria-label="Clase de activo">
        {ASSET_CLASSES.map((c) => <Pill key={c.id} active={tab === c.id} onClick={() => { setTab(c.id); setSelectedId(null); }}>{c.label}</Pill>)}
      </div>

      {tab === 'divisa' && <DivisasPanel ctx={ctx} />}
      {tab === 'cripto' && <HoldingsPanel ctx={ctx} assetClass="cripto" />}
      {tab === 'accion' && <HoldingsPanel ctx={ctx} assetClass="accion" />}

      <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-4">La TRM viene de los datos abiertos del Banco de la República; los criptoactivos, de CoinGecko; las acciones, de Twelve Data. Es una herramienta de control personal: no constituye asesoría financiera.</p>

      {dialog?.type === 'trade' && <TradeModal ctx={ctx} dialog={dialog} onClose={(id) => { setDialog(null); if (id && dialog.newHolding && dialog.newHolding.assetClass !== 'divisa') setSelectedId(id); }} />}
      {dialog?.type === 'picker' && <PickerModal ctx={ctx} assetClass={dialog.assetClass} onClose={(id) => { setDialog(null); if (id) setSelectedId(id); }} />}
    </div>
  );
}
