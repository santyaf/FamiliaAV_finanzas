// Llamada de bajo nivel a /api/ai-parse — el mismo endpoint genérico
// (provider/model/system/content → texto crudo del modelo) usado tanto por
// Registro rápido (QuickCapture) como por el Asistente financiero.
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
