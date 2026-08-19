// Helper compartido para exigir una sesión de Supabase válida en las
// funciones serverless de /api. Sin esto, cualquier persona en internet que
// encontrara la URL de estos endpoints podía usarlos gratis (y a cargo de
// nuestras cuentas de Anthropic/OpenAI/Google, o simplemente para saturar
// el endpoint) sin haber iniciado sesión en la app.
import { createClient } from '@supabase/supabase-js';

export async function getAuthedUser(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Devuelve true y ya respondió con 401 si NO hay sesión válida (para poder
// hacer `if (await requireAuth(req, res)) return;` en una sola línea).
export async function requireAuth(req, res) {
  const user = await getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'No autenticado. Inicia sesión en la app para usar esta función.' });
    return true;
  }
  req.user = user;
  return false;
}
