// Componentes de UI genéricos reutilizados en toda la app.

import React from 'react';
import {
  X, Briefcase, Receipt, Home, TrendingUp, Plus, Utensils, Car, HeartPulse,
  GraduationCap, Film, Shirt, Lightbulb, CreditCard, PiggyBank, Minus, Tag,
} from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, TAP_MIN } from './theme';

// Íconos SVG (Lucide) por categoría — reemplazan a los emoji que se veían
// distinto según el sistema operativo. Si el valor guardado no coincide con una
// clave conocida (categorías antiguas), se muestra como texto/emoji.
export const CATEGORY_ICON_MAP = {
  briefcase: Briefcase, receipt: Receipt, home: Home, 'trending-up': TrendingUp, plus: Plus,
  utensils: Utensils, car: Car, 'heart-pulse': HeartPulse, 'graduation-cap': GraduationCap,
  film: Film, shirt: Shirt, lightbulb: Lightbulb, 'credit-card': CreditCard,
  'piggy-bank': PiggyBank, minus: Minus, tag: Tag,
};
export const CATEGORY_ICON_OPTIONS = Object.keys(CATEGORY_ICON_MAP);

export function CategoryIcon({ icon, size = 16, color = T.ink }) {
  const Icon = CATEGORY_ICON_MAP[icon];
  if (Icon) return <Icon size={size} color={color} />;
  if (icon) return <span style={{ fontSize: size }}>{icon}</span>; // compat. categorías antiguas (emoji)
  return <Tag size={size} color={color} />;
}

async function safeClick(onClick, e) {
  try {
    await onClick?.(e);
  } catch (err) {
    alert(err?.message || 'Ocurrió un error al realizar esta acción.');
  }
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(27,43,58,0.45)' }} onClick={onClose}>
      <div
        className={`w-full ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} bg-white rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto`}
        style={{ background: T.surface }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: T.border }}>
          <h3 style={{ fontFamily: FONT_DISPLAY, color: T.ink }} className="text-lg font-semibold">{title}</h3>
          <IconButton icon={X} onClick={onClose} label="Cerrar" />
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block mb-4">
      <span className="block text-sm mb-1.5" style={{ color: T.inkSoft, fontFamily: FONT_BODY }}>{label}</span>
      {children}
    </label>
  );
}

export function PrimaryButton({ children, onClick, style, type = 'button', full }) {
  return (
    <button type={type} onClick={(e) => safeClick(onClick, e)}
      className={`${full ? 'w-full' : ''} rounded-xl font-medium transition-transform active:scale-[0.98]`}
      style={{ background: T.teal, color: '#fff', padding: '11px 18px', fontFamily: FONT_BODY, fontSize: 15, ...style }}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, style, full }) {
  return (
    <button onClick={(e) => safeClick(onClick, e)}
      className={`${full ? 'w-full' : ''} rounded-xl font-medium`}
      style={{ background: 'transparent', color: T.ink, border: `1px solid ${T.border}`, padding: '10px 18px', fontFamily: FONT_BODY, fontSize: 15, ...style }}>
      {children}
    </button>
  );
}

// Botón de ícono con área táctil accesible (mínimo 40x40px) y confirmación
// opcional para acciones destructivas (ver auditoría UX).
export function IconButton({ icon: Icon, onClick, size = 17, color = T.inkSoft, variant = 'default', confirmMessage, label, style }) {
  const isDanger = variant === 'danger';
  async function handleClick(e) {
    e.stopPropagation();
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    try {
      await onClick(e);
    } catch (err) {
      alert(err?.message || 'Ocurrió un error al realizar esta acción.');
    }
  }
  return (
    <button
      onClick={handleClick}
      aria-label={label}
      title={label}
      className="flex items-center justify-center rounded-full transition-transform active:scale-90"
      style={{
        width: TAP_MIN, height: TAP_MIN, flexShrink: 0,
        background: isDanger ? T.dangerSoft : 'transparent',
        ...style,
      }}
    >
      <Icon size={size} color={isDanger ? T.danger : color} />
    </button>
  );
}

export function Card({ children, style }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}`, ...style }}>
      {children}
    </div>
  );
}

export function ProgressBar({ value, color = T.teal, bg = '#EDEFE9', height = 8 }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div style={{ width: '100%', height, borderRadius: height, background: bg, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: height, transition: 'width .4s ease' }} />
    </div>
  );
}

export function MemberChip({ member, size = 24 }) {
  if (!member) return null;
  return (
    <div className="inline-flex items-center gap-1.5">
      <div style={{ width: size, height: size, borderRadius: '50%', background: member.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, fontFamily: FONT_DISPLAY, fontWeight: 700 }}>
        {member.name.slice(0, 1).toUpperCase()}
      </div>
      <span style={{ fontFamily: FONT_BODY, fontSize: 14, color: T.ink }}>{member.name}</span>
    </div>
  );
}

export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-4">
      <div className="mb-3" style={{ opacity: 0.5 }}>{icon}</div>
      <p style={{ fontFamily: FONT_DISPLAY, color: T.ink, fontSize: 16 }} className="font-semibold">{title}</p>
      <p style={{ fontFamily: FONT_BODY, color: T.inkSoft, fontSize: 13.5 }} className="mt-1 max-w-xs">{subtitle}</p>
    </div>
  );
}
