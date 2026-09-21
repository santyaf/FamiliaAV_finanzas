import React from 'react';
import { Check, Plus, Home } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY } from '../ui/theme';
import { Modal, GhostButton } from '../ui/primitives';
import { householdOptions } from '../lib/households';

// Cambiar entre los hogares de la persona (la familia, los papás, un fondo con amigos…) o sumar otro.
export function HouseholdSwitcherModal({ data, actions, onClose }) {
  const options = householdOptions(data.households, data.activeHouseholdId);
  const choose = (o) => { if (!o.isActive) actions.switchHousehold(o.id); onClose(); };
  return (
    <Modal title="Mis hogares" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Cada hogar tiene sus propias cuentas, movimientos e integrantes. Cambia de uno a otro cuando lo necesites.
      </p>
      <div className="flex flex-col gap-2 mb-4" role="radiogroup" aria-label="Hogares">
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={o.isActive} onClick={() => choose(o)} className="flex items-center gap-3 rounded-xl p-3 text-left"
            style={{ background: o.isActive ? T.tealSoft : T.bg, border: `1px solid ${o.isActive ? T.teal : T.border}` }}>
            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 10, background: o.color || T.teal }}>
              <Home size={16} color="#fff" />
            </div>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_DISPLAY, fontWeight: 700 }} className="truncate">{o.name}</p>
              <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{o.roleLabel} · {o.currency}</p>
            </div>
            {o.isActive && <Check size={18} color={T.teal} aria-label="Hogar actual" />}
          </button>
        ))}
      </div>
      <GhostButton full onClick={() => { onClose(); actions.addHousehold(); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={15} /> Crear otro hogar o unirme con código
      </GhostButton>
    </Modal>
  );
}
