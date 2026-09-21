import React, { useRef, useState } from 'react';
import { T, FONT_BODY } from '../ui/theme';
import { swipeOffset, settleSwipe, SWIPE_START_PX } from '../lib/swipe';

export const ACTION_WIDTH = 56;

// Fila que se desliza hacia la izquierda (dedo o mouse) para mostrar botones de acción
// con icono detrás. También se abre con la flecha izquierda y se cierra con Escape o la
// flecha derecha. actions: [{ key, label, icon: Icon, color, bg, onClick }]
export function SwipeRow({ actions, children }) {
  const max = actions.length * ACTION_WIDTH;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null); // { startX, startOffset, moved, id }
  const suppressClick = useRef(false);
  const open = offset <= -max + 1;

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { startX: e.clientX, startOffset: offset, moved: false, id: e.pointerId };
  }
  function onPointerMove(e) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < SWIPE_START_PX) return;
      d.moved = true;
      setDragging(true);
      try { e.currentTarget.setPointerCapture(d.id); } catch { /* jsdom / navegadores sin captura */ }
    }
    setOffset(swipeOffset(d.startOffset, dx, max));
  }
  function finish(e) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) return;
    const dx = e.clientX - d.startX;
    suppressClick.current = true; // el toque que termina un arrastre no debe activar nada
    setTimeout(() => { suppressClick.current = false; }, 0);
    setDragging(false);
    setOffset(settleSwipe(swipeOffset(d.startOffset, dx, max), dx, max));
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setOffset(-max); }
    else if (e.key === 'ArrowRight') { setOffset(0); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOffset(0); } // cierra la fila, no el pop-up
  }

  return (
    <div className="relative overflow-hidden rounded-xl" style={{ background: T.bg }}>
      <div className="absolute top-0 bottom-0 right-0 flex" style={{ width: max }} aria-hidden={!open}>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key} type="button" tabIndex={open ? 0 : -1} aria-label={a.label} title={a.label}
              onClick={() => { setOffset(0); a.onClick(); }}
              className="flex flex-col items-center justify-center gap-0.5"
              style={{ width: ACTION_WIDTH, background: a.bg || T.bg, color: a.color || T.ink }}
            >
              <Icon size={18} color={a.color || T.ink} />
              <span style={{ fontSize: 9.5, fontFamily: FONT_BODY, fontWeight: 600, color: a.color || T.ink }}>{a.short || a.label}</span>
            </button>
          );
        })}
      </div>
      <div
        data-testid="swipe-front" tabIndex={0} onKeyDown={onKeyDown}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish}
        onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); } }}
        style={{
          position: 'relative', transform: `translateX(${offset}px)`, touchAction: 'pan-y', userSelect: dragging ? 'none' : 'auto',
          transition: dragging ? 'none' : 'transform .2s ease', background: T.surface, borderRadius: 12,
        }}
      >
        {children}
      </div>
    </div>
  );
}
