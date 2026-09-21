import React, { useState } from 'react';
import { Building2, Car, TrendingUp, HandCoins, Package, Pencil, Trash2, BadgeDollarSign, Landmark } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, GhostButton, IconButton, Modal, Field, EmptyState } from '../ui/primitives';
import { formatMoney, formatDate } from '../lib/format';
import { todayISO, creditOutstandingBalance, daysUntil } from '../lib/finance';
import { ASSET_KINDS, assetKindLabel, assetValueAt, assetGain } from '../lib/assets';

const KIND_ICON = { propiedad: Building2, vehiculo: Car, inversion: TrendingUp, por_cobrar: HandCoins, otro: Package };
const BASIS_LABEL = { valoracion: 'según su última valoración', costo: 'a su costo', estimado: 'estimado con su rentabilidad', vendido: 'vendido', no_existia: '' };
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

// Gestión → Activos: lo que tienes (propiedades, vehículos, inversiones, cuentas por cobrar) con su
// valor a hoy, para el Estado de Situación Financiera y el patrimonio.
export function Activos({ data, actions, setModal }) {
  const currency = data.currency;
  const money = (n) => formatMoney(n, currency);
  const today = todayISO();
  const assets = data.assets || [];
  const active = assets.filter((a) => a.status !== 'vendido');
  const sold = assets.filter((a) => a.status === 'vendido');
  const credits = data.creditsWithPayments || [];

  const rows = active.map((a) => {
    const v = assetValueAt(a, a.valuations, today);
    const linked = credits.find((c) => c.credit.id === a.creditId);
    const debt = linked && linked.credit.currency === currency ? creditOutstandingBalance(linked.credit, linked.payments) : null;
    return { asset: a, ...v, gain: assetGain(a, v.value), debt, linkedName: linked?.credit.name };
  });
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalDebt = rows.reduce((s, r) => s + (r.debt || 0), 0);
  const byKind = ASSET_KINDS.map((k) => ({ ...k, rows: rows.filter((r) => r.asset.kind === k.id) })).filter((k) => k.rows.length);

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2"><BadgeDollarSign size={18} color={T.teal} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Activos e inversiones</p></div>
        <PrimaryButton onClick={() => setModal({ type: 'asset' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nuevo</PrimaryButton>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Lo que tienes además del dinero en cuentas. Alimenta el Estado de Situación Financiera (Informes) y el patrimonio del Dashboard.</p>

      {active.length === 0 && (
        <EmptyState icon={<Landmark size={34} color={T.teal} />} title="Aún no registras activos"
          subtitle="Agrega tu casa, tu carro, un CDT, acciones, o dinero que te deben. Actualiza su valor de vez en cuando y verás cómo crece tu patrimonio." />
      )}

      {active.length > 0 && (
        <Card style={{ marginBottom: 14, background: T.inverse, border: 'none' }}>
          <p style={{ fontSize: 12, color: '#fff', opacity: 0.75, fontFamily: FONT_BODY }}>Valor de tus activos hoy</p>
          <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 24, color: '#fff' }}>{money(totalValue)}</p>
          <div className="flex gap-4 mt-1 flex-wrap">
            {byKind.map((k) => <span key={k.id} style={{ fontSize: 11, color: '#fff', opacity: 0.75 }}>{k.label.split(' (')[0]} {money(k.rows.reduce((s, r) => s + r.value, 0))}</span>)}
          </div>
          {totalDebt > 0 && <p style={{ fontSize: 11.5, color: '#fff', opacity: 0.85, fontFamily: FONT_BODY }} className="mt-2">Deuda asociada {money(totalDebt)} · te quedan {money(totalValue - totalDebt)} en estos activos</p>}
        </Card>
      )}

      {byKind.map((k) => (
        <div key={k.id} className="mb-4">
          <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600 }} className="mb-2">{k.label}</p>
          <div className="flex flex-col gap-2">
            {k.rows.map((r) => {
              const a = r.asset; const Icon = KIND_ICON[a.kind] || Package;
              const daysToMaturity = a.maturityDate ? daysUntil(a.maturityDate) : null;
              return (
                <Card key={a.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: T.tealSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={16} color={T.teal} /></div>
                      <div className="min-w-0">
                        <p className="truncate" style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{a.name}</p>
                        <p style={{ fontSize: 11, color: T.inkSoft }}>{a.ownerMemberId ? 'Solo tuyo' : 'Del hogar'}{a.institution ? ` · ${a.institution}` : ''}</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 15, color: T.ink }}>{money(r.value)}</p>
                      <p style={{ fontSize: 10.5, color: T.inkSoft }}>{BASIS_LABEL[r.basis]}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
                    {a.acquisitionCost > 0 && <span style={{ fontSize: 11.5, color: T.inkSoft }}>Costo {money(a.acquisitionCost)}</span>}
                    {r.gain && <span style={{ fontSize: 11.5, color: r.gain.amount >= 0 ? T.teal : T.coral, fontFamily: FONT_MONO }}>{r.gain.amount >= 0 ? '+' : ''}{money(r.gain.amount)} ({r.gain.pct > 0 ? '+' : ''}{r.gain.pct}%)</span>}
                    {a.annualReturnRate > 0 && <span style={{ fontSize: 11.5, color: T.inkSoft }}>Rentabilidad {a.annualReturnRate}% E.A.</span>}
                    {daysToMaturity !== null && <span style={{ fontSize: 11.5, color: daysToMaturity < 0 ? T.inkSoft : daysToMaturity <= 30 ? T.gold : T.inkSoft }}>{daysToMaturity < 0 ? `Venció el ${formatDate(a.maturityDate)}` : `Vence ${formatDate(a.maturityDate)} (${daysToMaturity} días)`}</span>}
                  </div>
                  {r.debt !== null && r.debt > 0 && <p style={{ fontSize: 11.5, color: T.ink, fontFamily: FONT_BODY }} className="mt-1">Deuda: {r.linkedName} {money(r.debt)} · patrimonio en este activo <strong style={{ fontFamily: FONT_MONO }}>{money(r.value - r.debt)}</strong></p>}
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    <GhostButton onClick={() => setModal({ type: 'assetValuation', payload: { asset: a } })} style={{ padding: '6px 12px', fontSize: 12.5 }}>Actualizar valor</GhostButton>
                    <GhostButton onClick={() => setModal({ type: 'sellAsset', payload: { asset: a } })} style={{ padding: '6px 12px', fontSize: 12.5 }}>{a.kind === 'por_cobrar' ? 'Me pagaron' : 'Vender'}</GhostButton>
                    <div className="flex items-center gap-1 ml-auto">
                      <IconButton icon={Pencil} onClick={() => setModal({ type: 'asset', payload: a })} label="Editar activo" />
                      <IconButton icon={Trash2} variant="danger" onClick={() => actions.deleteAsset(a.id)} confirmMessage={`¿Eliminar "${a.name}"? Se borra también su historial de valoraciones. Los movimientos ya registrados no se borran.`} label="Eliminar activo" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {sold.length > 0 && (
        <div className="mt-2">
          <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600 }} className="mb-2">Vendidos o cobrados</p>
          {sold.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
              <div>
                <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{a.name}</p>
                <p style={{ fontSize: 11, color: T.inkSoft }}>{formatDate(a.soldOn)}</p>
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.ink }}>{money(a.soldAmount || 0)}</span>
              <IconButton icon={Trash2} variant="danger" size={14} onClick={() => actions.deleteAsset(a.id)} confirmMessage={`¿Eliminar "${a.name}" del historial?`} label="Eliminar activo vendido" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssetModal({ data, actions, payload, onClose }) {
  const editing = !!payload?.id;
  const [name, setName] = useState(payload?.name || '');
  const [kind, setKind] = useState(payload?.kind || 'propiedad');
  const [shared, setShared] = useState(editing ? !payload.ownerMemberId : true);
  const [acquiredOn, setAcquiredOn] = useState(payload?.acquiredOn || todayISO());
  const [cost, setCost] = useState(payload?.acquisitionCost ? String(payload.acquisitionCost) : '');
  const [currentValue, setCurrentValue] = useState('');
  const [institution, setInstitution] = useState(payload?.institution || '');
  const [notes, setNotes] = useState(payload?.notes || '');
  const [creditId, setCreditId] = useState(payload?.creditId || '');
  const [rate, setRate] = useState(payload?.annualReturnRate ? String(payload.annualReturnRate) : '');
  const [maturity, setMaturity] = useState(payload?.maturityDate || '');
  const [payAccount, setPayAccount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const credits = (data.creditsWithPayments || []).filter((c) => c.credit.status !== 'pagado');
  const isReceivable = kind === 'por_cobrar';

  async function save() {
    if (!name.trim()) { setError('Ponle un nombre.'); return; }
    if (num(cost) < 0) { setError('El costo no puede ser negativo.'); return; }
    if (!editing && num(cost) <= 0 && num(currentValue) <= 0) { setError('Indica el costo o el valor actual.'); return; }
    const owner = shared ? null : actions.userId;
    const a = {
      ownerMemberId: owner, name: name.trim(), kind, acquiredOn: acquiredOn || null, acquisitionCost: num(cost),
      creditId: creditId || null, annualReturnRate: kind === 'inversion' && rate !== '' ? num(rate) : null,
      maturityDate: kind === 'inversion' && maturity ? maturity : null, institution: institution.trim(), notes: notes.trim(),
    };
    setSaving(true); setError('');
    try {
      if (editing) await actions.updateAsset(payload.id, a);
      else await actions.createAsset({ ...a, currentValue: num(currentValue), payFromAccountId: payAccount || null, payMemberId: actions.userId });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo guardar el activo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? 'Editar activo' : 'Nuevo activo'} wide onClose={onClose}>
      <Field label="Nombre">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Apartamento Laureles, CDT Bancolombia, Carro" />
      </Field>
      <Field label="Tipo">
        <select style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value)}>
          {ASSET_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </Field>
      <Field label="¿De quién es?">
        <select style={inputStyle} value={shared ? 'hogar' : 'yo'} onChange={(e) => setShared(e.target.value === 'hogar')}>
          <option value="hogar">Del hogar (lo ven todos los integrantes)</option>
          <option value="yo">Solo mío (privado)</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isReceivable ? 'Monto que te deben' : 'Costo de adquisición'}>
          <input style={inputStyle} type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
        </Field>
        <Field label={isReceivable ? 'Desde' : 'Fecha de compra'}>
          <input style={inputStyle} type="date" value={acquiredOn} onChange={(e) => setAcquiredOn(e.target.value)} />
        </Field>
      </div>
      {!editing && !isReceivable && (
        <Field label="Valor actual (solo si es distinto al costo)">
          <input style={inputStyle} type="number" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="Ej. lo que valdría hoy si lo vendieras" />
        </Field>
      )}
      {kind === 'inversion' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rentabilidad E.A. % (opcional)">
            <input style={inputStyle} type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ej. 11.5" />
          </Field>
          <Field label="Vence (opcional)">
            <input style={inputStyle} type="date" value={maturity} onChange={(e) => setMaturity(e.target.value)} />
          </Field>
        </div>
      )}
      {kind === 'inversion' && <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Con rentabilidad, el valor crece solo (estimado) hasta el vencimiento, salvo que lo actualices a mano con el valor real del banco.</p>}
      <Field label={kind === 'inversion' ? 'Entidad (banco, comisionista…)' : 'Ubicación o entidad (opcional)'}>
        <input style={inputStyle} value={institution} onChange={(e) => setInstitution(e.target.value)} />
      </Field>
      {(kind === 'propiedad' || kind === 'vehiculo') && (
        <Field label="Crédito asociado (hipoteca, crédito del carro)">
          <select style={inputStyle} value={creditId} onChange={(e) => setCreditId(e.target.value)}>
            <option value="">— sin deuda asociada —</option>
            {credits.map((c) => <option key={c.credit.id} value={c.credit.id}>{c.credit.name}</option>)}
          </select>
        </Field>
      )}
      {!editing && !isReceivable && (
        <Field label="¿Lo pagaste desde una cuenta de la app? (opcional)">
          <select style={inputStyle} value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
            <option value="">No, solo registrarlo</option>
            {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      )}
      {payAccount && <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Se registra una salida de inversión por el costo (no cuenta como gasto en el Estado de resultados).</p>}
      <Field label="Notas (opcional)">
        <input style={inputStyle} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear activo'}</PrimaryButton>
    </Modal>
  );
}

export function ValuationModal({ data, actions, payload, onClose }) {
  const asset = (data.assets || []).find((a) => a.id === payload.asset.id) || payload.asset;
  const money = (n) => formatMoney(n, data.currency);
  const [date, setDate] = useState(todayISO());
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const now = assetValueAt(asset, asset.valuations, todayISO());

  async function add() {
    if (!(num(value) >= 0) || value === '') { setError('Indica el valor.'); return; }
    setBusy(true); setError('');
    try { await actions.addAssetValuation(asset.id, { date, value: num(value), note: note.trim() }); setValue(''); setNote(''); }
    catch (e) { setError(e.message || 'No se pudo guardar la valoración.'); }
    finally { setBusy(false); }
  }
  async function remove(v) {
    if (!window.confirm('¿Quitar esta valoración?')) return;
    try { await actions.deleteAssetValuation(v.id); } catch (e) { setError(e.message || 'No se pudo quitar.'); }
  }

  return (
    <Modal title={`Valor de ${asset.name}`} onClose={onClose}>
      <div className="rounded-xl p-3 mb-4" style={{ background: T.bg }}>
        <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>Valor hoy ({BASIS_LABEL[now.basis] || '—'})</p>
        <p style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 20, color: T.ink }}>{money(now.value)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de la valoración"><input style={inputStyle} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Valor"><input style={inputStyle} type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" /></Field>
      </div>
      <Field label="Nota (opcional)"><input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. avalúo comercial, extracto del banco" /></Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={add}>{busy ? 'Guardando…' : 'Agregar valoración'}</PrimaryButton>

      {asset.valuations.length > 0 && (
        <div className="mt-4">
          <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY, fontWeight: 600 }} className="mb-1.5">Historial</p>
          {[...asset.valuations].reverse().map((v) => (
            <div key={v.id} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${T.border}` }}>
              <div>
                <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>{formatDate(v.date)}</p>
                {v.note && <p style={{ fontSize: 11, color: T.inkSoft }}>{v.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: T.ink }}>{money(v.value)}</span>
                <IconButton icon={Trash2} variant="danger" size={13} onClick={() => remove(v)} label="Quitar valoración" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function SellAssetModal({ data, actions, payload, onClose }) {
  const { asset } = payload;
  const isReceivable = asset.kind === 'por_cobrar';
  const last = assetValueAt(asset, asset.valuations, todayISO()).value;
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(String(Math.round(last) || ''));
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!(num(amount) >= 0) || amount === '') { setError('Indica el monto.'); return; }
    setSaving(true); setError('');
    try {
      await actions.sellAsset(asset, { date, amount: num(amount), accountId: accountId || null, memberId: actions.userId });
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo registrar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isReceivable ? `Cobro de ${asset.name}` : `Vender ${asset.name}`} onClose={onClose}>
      <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Valor registrado hoy: {formatMoney(last, data.currency)}. {isReceivable ? 'Al marcarlo cobrado deja de contar como activo.' : 'Al venderlo deja de contar como activo; la ganancia o pérdida frente a su valor en libros se ve como valorización en Cambios en el patrimonio.'}
      </p>
      <Field label="Fecha"><input style={inputStyle} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label={isReceivable ? 'Monto cobrado' : 'Precio de venta'}><input style={inputStyle} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="¿A qué cuenta entró el dinero? (opcional)">
        <select style={inputStyle} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">No registrar el ingreso en una cuenta</option>
          {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {accountId && <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Se registra como ingreso de inversión (no cuenta como ingreso operativo).</p>}
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : isReceivable ? 'Marcar como cobrado' : 'Registrar venta'}</PrimaryButton>
    </Modal>
  );
}
