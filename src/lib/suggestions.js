// Sugerencias de mejora (Fase 13). Lógica pura: estados, limpieza del texto y
// conversión de lo que devuelve la IA. Lo demás (base de datos, pantallas)
// vive en db.js, AdminPanel, Ajustes y el chat del Asistente.

export const SUGGESTION_STATUSES = [
  { id: 'nueva', label: 'Nueva' },
  { id: 'en_revision', label: 'En revisión' },
  { id: 'aprobada', label: 'Aprobada' },
  { id: 'en_desarrollo', label: 'En desarrollo' },
  { id: 'implementada', label: 'Implementada' },
  { id: 'rechazada', label: 'Rechazada' },
];

export const TITLE_MAX = 140;
export const DESCRIPTION_MAX = 4000;
const MIN_LENGTH = 3;

export function suggestionStatusLabel(id) {
  return SUGGESTION_STATUSES.find((s) => s.id === id)?.label || id;
}

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Deja título y descripción listos para guardar. Si falta el título lo saca
// del inicio de la descripción; devuelve null si no hay nada que guardar.
export function cleanSuggestion({ title, description } = {}) {
  const desc = String(description ?? '').trim().slice(0, DESCRIPTION_MAX);
  if (desc.length < MIN_LENGTH) return null;
  let cleanTitle = collapse(title);
  if (cleanTitle.length < MIN_LENGTH) cleanTitle = collapse(desc).slice(0, 80);
  cleanTitle = cleanTitle.slice(0, TITLE_MAX);
  return { title: cleanTitle, description: desc };
}

// La IA responde {"tipo":"sugerencia","titulo":"...","descripcion":"..."}.
export function suggestionFromAi(parsed) {
  return cleanSuggestion({ title: parsed?.titulo, description: parsed?.descripcion });
}
