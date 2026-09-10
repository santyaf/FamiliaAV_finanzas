import React, { useState } from 'react';
import { PiggyBank, Trash2 } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import {
  Card, PrimaryButton, GhostButton, IconButton, ProgressBar, Modal, Field, CategoryIcon, EmptyState,
} from '../ui/primitives';
import { formatMoney } from '../lib/format';
import { thisMonthKey, todayISO, occurrencesInMonth } from '../lib/finance';

export function Presupuestos({ data, actions, setModal }) {
  const mKey = thisMonthKey();
  const currency = data.currency;

  function removeBudget(id) { actions.removeBudget(id); }

  // Presupuesto sugerido = promedio de gasto real de los últimos 3 meses completos,
  // para categorías que aún no tienen un presupuesto configurado (a nivel de hogar).
  const configuredCategoryIds = new Set(data.budgets.filter((b) => b.scope === 'household').map((b) => b.categoryId));
  const now = new Date(todayISO() + 'T00:00:00');
  const monthKeys = [1, 2, 3].map((n) => {
    const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const suggestions = data.categories
    .filter((c) => c.type === 'expense' && !configuredCategoryIds.has(c.id))
    .map((c) => {
      const totalByMonth = monthKeys.map((mk) =>
        data.transactions
          .filter((t) => t.type === 'expense' && t.categoryId === c.id && occurrencesInMonth(t, mk))
          .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mk), 0),
      );
      const monthsWithData = totalByMonth.filter((v) => v > 0).length;
      const avg = monthsWithData ? totalByMonth.reduce((a, b) => a + b, 0) / monthsWithData : 0;
      return { category: c, avg, monthsWithData };
    })
    .filter((s) => s.avg > 0)
    .sort((a, b) => b.avg - a.avg);

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center justify-between mb-3">
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Presupuestos mensuales</p>
        <PrimaryButton onClick={() => setModal({ type: 'budget' })} style={{ padding: '8px 14px', fontSize: 13 }}>+ Nuevo</PrimaryButton>
      </div>

      {data.budgets.length === 0 && <EmptyState icon={<PiggyBank size={36} color={T.teal} />} title="Sin presupuestos" subtitle="Define límites mensuales por categoría para recibir alertas antes de excederte." />}

      <div className="flex flex-col gap-3 mb-5">
        {data.budgets.map((b) => {
          const cat = data.categories.find((c) => c.id === b.categoryId);
          const spent = data.transactions
            .filter((t) => t.type === 'expense' && t.categoryId === b.categoryId && occurrencesInMonth(t, mKey) && (b.scope === 'household' || t.memberId === b.scope))
            .reduce((s, t) => s + t.amount * occurrencesInMonth(t, mKey), 0);
          const pct = (spent / b.limit) * 100;
          const scopeLabel = b.scope === 'household' ? 'Todo el hogar' : data.members.find((m) => m.id === b.scope)?.name;
          return (
            <Card key={b.id}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="flex items-center gap-1.5" style={{ fontFamily: FONT_BODY, fontWeight: 500, fontSize: 14, color: T.ink }}><CategoryIcon icon={cat?.icon} size={16} /> {cat?.name}</span>
                <IconButton icon={Trash2} variant="danger" onClick={() => removeBudget(b.id)} confirmMessage="¿Eliminar este presupuesto?" label="Eliminar presupuesto" />
              </div>
              <p style={{ fontSize: 11, color: T.inkSoft }} className="mb-2">{scopeLabel}</p>
              <ProgressBar value={pct} color={pct >= 100 ? T.danger : pct >= 80 ? T.gold : T.teal} />
              <div className="flex items-center justify-between mt-1.5">
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.inkSoft }}>{formatMoney(spent, currency)} de {formatMoney(b.limit, currency)}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: pct >= 100 ? T.danger : T.ink }}>{Math.round(pct)}%</span>
              </div>
            </Card>
          );
        })}
      </div>

      {suggestions.length > 0 && (
        <>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-1">Sugeridos automáticamente</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Con base en tu gasto promedio de los últimos meses en categorías que aún no tienen un presupuesto.</p>
          <div className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <Card key={s.category.id} style={{ background: T.bg, border: `1px dashed ${T.border}` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="flex items-center gap-1.5" style={{ fontFamily: FONT_BODY, fontWeight: 500, fontSize: 13.5, color: T.ink }}><CategoryIcon icon={s.category.icon} size={15} /> {s.category.name}</span>
                    <p style={{ fontSize: 10.5, color: T.inkSoft }} className="mt-0.5">Promedio de {s.monthsWithData} mes(es) · {formatMoney(s.avg, currency)}/mes</p>
                  </div>
                  <GhostButton onClick={() => setModal({ type: 'budget', payload: { categoryId: s.category.id, limit: s.avg } })} style={{ fontSize: 11.5, padding: '7px 12px' }}>Usar</GhostButton>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function BudgetModal({ data, actions, payload, onClose }) {
  const expenseCats = data.categories.filter((c) => c.type === 'expense');
  const [categoryId, setCategoryId] = useState(payload?.categoryId || expenseCats[0]?.id || '');
  const [limit, setLimit] = useState(payload?.limit ? String(Math.round(payload.limit)) : '');
  const [scope, setScope] = useState('household');
  async function save() {
    const lim = parseFloat(limit);
    if (!lim || !categoryId) return;
    await actions.addBudget({ categoryId, limit: lim, scope });
    onClose();
  }
  return (
    <Modal title="Nuevo presupuesto" onClose={onClose}>
      <Field label="Categoría">
        <select style={inputStyle} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Límite mensual">
        <input style={inputStyle} type="number" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Aplica a">
        <select style={inputStyle} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="household">Todo el hogar</option>
          {data.members.map((m) => <option key={m.id} value={m.id}>Solo {m.name}</option>)}
        </select>
      </Field>
      <PrimaryButton full onClick={save}>Guardar presupuesto</PrimaryButton>
    </Modal>
  );
}
