// Matemática del gesto de deslizar una fila hacia la izquierda para mostrar sus acciones.
// `max` = ancho total de los botones ocultos (px). El desplazamiento va de -max (abierta) a 0.

export function swipeOffset(startOffset, dx, max) {
  return Math.max(-max, Math.min(0, startOffset + dx));
}

// Al soltar: ¿queda abierta (-max) o cerrada (0)? Depende de hacia dónde se movió el dedo:
// un empujón corto hacia la izquierda abre; uno corto hacia la derecha cierra.
export function settleSwipe(offset, dx, max) {
  const shown = Math.abs(offset);
  if (dx < -4) return shown >= max * 0.3 ? -max : 0;
  if (dx > 4) return shown <= max * 0.7 ? 0 : -max;
  return shown >= max / 2 ? -max : 0;
}

// Un movimiento cuenta como deslizar (y no como un toque) pasados unos píxeles.
export const SWIPE_START_PX = 6;
