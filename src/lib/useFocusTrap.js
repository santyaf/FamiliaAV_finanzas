import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Siguiente índice al pulsar Tab dentro de un diálogo: da la vuelta al llegar al final (o al inicio con Shift).
export function nextFocusIndex(count, current, shift) {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  if (shift) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

// Sin medir el layout (jsdom no lo tiene): se descarta lo oculto por atributo o por estilo.
const isVisible = (el) => {
  if (el.closest('[aria-hidden="true"], [hidden]')) return false;
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden';
};

export const focusableIn = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(isVisible);

// Diálogo accesible: al abrir enfoca el primer campo, Tab no se sale, Escape cierra y al cerrar devuelve el
// foco a lo que lo tenía. Además bloquea el scroll del fondo mientras está abierto.
export function useDialogA11y(ref, onClose, { lockScroll = true } = {}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const previous = document.activeElement;
    const list = focusableIn(root);
    // el primer campo de texto si hay; si no, el primer control (que suele ser "Cerrar")
    (list.find((el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) || list[0] || root).focus?.();
    const scrollLock = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      const items = focusableIn(root);
      if (!items.length) { e.preventDefault(); return; }
      const idx = items.indexOf(document.activeElement);
      const next = nextFocusIndex(items.length, idx, e.shiftKey);
      const atEdge = (!e.shiftKey && idx === items.length - 1) || (e.shiftKey && idx === 0) || idx < 0;
      if (atEdge) { e.preventDefault(); items[next].focus(); }
    };
    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      if (lockScroll) document.body.style.overflow = scrollLock;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
    };
  }, [ref]);
}
