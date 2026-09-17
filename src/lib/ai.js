// Llamada de bajo nivel a /api/ai-parse — el mismo endpoint genérico
// (provider/model/system/content → texto crudo del modelo) usado por el
// chat del Asistente financiero, tanto para responder preguntas como para
// extraer movimientos de un mensaje de texto o la foto de un recibo.
import { supabase } from './supabaseClient';

export async function callAiApi({ system, content, provider, model }) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch('/api/ai-parse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ provider, model, system, content }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error);
  return json.text || '';
}

export function stripJsonFences(text) {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

// Llama al modelo y parsea su respuesta como JSON (el Asistente siempre le
// pide JSON estricto, así que un texto no parseable es un error de verdad).
export async function callAiJson({ system, content, provider, model }) {
  const text = await callAiApi({ system, content, provider, model });
  return JSON.parse(stripJsonFences(text));
}

export function matchCategory(guessName, type, categories) {
  const pool = categories.filter((c) => c.type === type);
  if (!guessName) return pool[0]?.id;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const g = norm(guessName);
  let found = pool.find((c) => norm(c.name) === g);
  if (!found) found = pool.find((c) => norm(c.name).includes(g) || g.includes(norm(c.name)));
  return (found || pool[0])?.id;
}

export function matchMember(guessName, members) {
  if (!guessName) return null;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const g = norm(guessName);
  const found = members.find((m) => norm(m.name) === g || g.includes(norm(m.name)) || norm(m.name).includes(g));
  return found?.id || null;
}
