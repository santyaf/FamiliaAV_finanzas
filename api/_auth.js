// Helper compartido para exigir una sesión de Supabase válida en las
// funciones serverless de /api. Sin esto, cualquier persona en internet que
// encontrara la URL de estos endpoints podía usarlos gratis (y a cargo de
// nuestras cuentas de Anthropic/OpenAI/Google, o simplemente para saturar
// el endpoint) sin haber iniciado sesión en la app.
import { createClient } from '@supabase/supabase-js';

function bearerToken(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  return authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

export async function getAuthedUser(req) {
  const token = bearerToken(req);
  if (!token) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  // una cuenta desactivada o suspendida tampoco puede usar los endpoints (Fase 21).
  // Se consulta con el propio token del usuario; si la consulta falla no se bloquea.
  try {
    const asUser = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: profile } = await asUser.from('profiles').select('status').eq('id', data.user.id).maybeSingle();
    if (profile && profile.status && profile.status !== 'active') return null;
  } catch { /* fail-open */ }
  return data.user;
}

// Límite de uso por persona y endpoint (Fase 26): la base cuenta las llamadas por hora y por día
// (función api_hit, con el token del propio usuario). Si la base no responde NO se bloquea: un fallo
// del contador no debe dejar sin asistente a todo el mundo.
export async function checkRateLimit(req, { endpoint, hourly, daily }) {
  const token = bearerToken(req);
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseAnonKey) return { allowed: true };
  try {
    const asUser = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await asUser.rpc('api_hit', { p_endpoint: endpoint, p_hourly: hourly, p_daily: daily });
    if (error || !data) return { allowed: true };
    return data;
  } catch {
    return { allowed: true };
  }
}

// Devuelve true y ya respondió con 401 si NO hay sesión válida (para poder
// hacer `if (await requireAuth(req, res)) return;` en una sola línea). Con
// `limit: { endpoint, hourly, daily }` también responde 429 al pasarse del límite.
export async function requireAuth(req, res, options = {}) {
  const user = await getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'No autenticado. Inicia sesión en la app para usar esta función.' });
    return true;
  }
  req.user = user;
  if (options.limit) {
    const r = await checkRateLimit(req, options.limit);
    if (r.allowed === false) {
      const retry = Number(r.retry_after) || 3600;
      res.setHeader?.('Retry-After', String(retry));
      res.status(429).json({
        error: r.reason === 'daily'
          ? 'Llegaste al límite diario de uso de esta función. Vuelve mañana.'
          : `Estás usando esta función muy seguido. Espera ${Math.ceil(retry / 60)} min e inténtalo de nuevo.`,
        retryAfterSeconds: retry,
      });
      return true;
    }
  }
  return false;
}
