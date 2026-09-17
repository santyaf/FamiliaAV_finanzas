// Llamada de bajo nivel a /api/ai-parse — el mismo endpoint genérico
// (provider/model/system/content → texto crudo del modelo) usado por el
// chat del Asistente financiero, tanto para responder preguntas como para
// extraer movimientos de un mensaje de texto o la foto de un recibo.
import { supabase } from './supabaseClient';
import { stripJsonFences } from './aiParse';

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

// Llama al modelo y parsea su respuesta como JSON (el Asistente siempre le
// pide JSON estricto, así que un texto no parseable es un error de verdad).
export async function callAiJson({ system, content, provider, model }) {
  const text = await callAiApi({ system, content, provider, model });
  return JSON.parse(stripJsonFences(text));
}
