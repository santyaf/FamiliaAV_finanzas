// Cliente de /api/market (TRM, criptoactivos y acciones). Siempre con la sesión de la persona; el servidor
// guarda la clave de las acciones y cachea, así que aquí solo se pide y se traducen los errores.
import { supabase } from './supabaseClient';

export async function fetchMarket(kind, params = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const qs = new URLSearchParams({ kind, ...params });
  const res = await fetch(`/api/market?${qs}`, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  });
  let json = null;
  try { json = await res.json(); } catch { /* respuesta sin cuerpo */ }
  if (!res.ok) {
    const err = new Error(json?.message || json?.error || `No se pudo consultar el mercado (${res.status}).`);
    err.code = json?.error || null;
    err.status = res.status;
    throw err;
  }
  return json;
}

// Mensaje corto para mostrar cuando una consulta falla.
export function marketErrorText(err) {
  if (!err) return '';
  if (err.code === 'sin_clave') return 'Las acciones aún no están activadas: falta configurar la clave de Twelve Data en Vercel.';
  if (err.status === 401) return 'Tu sesión venció. Vuelve a entrar.';
  if (err.status === 429) return err.message;
  if (err.status === 404) return 'Ese símbolo no existe en el proveedor de precios.';
  return 'No se pudo consultar el precio ahora mismo. Se muestra el último guardado.';
}
