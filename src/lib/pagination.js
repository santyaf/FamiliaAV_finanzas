// Mostrar listas largas de a poco: la app abre y se mueve rápido aunque haya miles de movimientos.
export const PAGE_SIZE = 50;

export const pageSlice = (list, count) => list.slice(0, Math.max(0, count));

// Cuántos mostrar después de pedir más (nunca más de los que hay).
export const nextCount = (current, total, step = PAGE_SIZE) => Math.min(total, current + step);
