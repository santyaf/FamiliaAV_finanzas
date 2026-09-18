// Avisa por push a los administradores de la plataforma cuando llega una
// sugerencia nueva (el aviso dentro de la app lo crea un trigger en la base).
//
// Lo llama el cliente justo después de guardar la sugerencia. Requiere la
// sesión de quien sugirió, y solo funciona para una sugerencia propia y una
// sola vez (admin_notified_at) — así no sirve para spamear a los admins.
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { getAuthedUser } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  const user = await getAuthedUser(req);
  if (!user) {
    res.status(401).json({ error: 'No autenticado.' });
    return;
  }
  const suggestionId = req.body?.suggestionId;
  if (!suggestionId) {
    res.status(400).json({ error: 'Falta suggestionId.' });
    return;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VITE_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    res.status(200).json({ ok: false, skipped: 'Push no configurado en el servidor.' });
    return;
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const { data: s, error } = await supabase.from('suggestions')
      .select('id, user_id, title').eq('id', suggestionId).maybeSingle();
    if (error) throw error;
    if (!s || s.user_id !== user.id) {
      res.status(404).json({ error: 'Sugerencia no encontrada.' });
      return;
    }
    // "Reclamar" el envío: solo la primera llamada avisa, las repetidas no hacen nada.
    const { data: claimed, error: claimError } = await supabase.from('suggestions')
      .update({ admin_notified_at: new Date().toISOString() })
      .eq('id', s.id).is('admin_notified_at', null).select('id');
    if (claimError) throw claimError;
    if (!claimed?.length) {
      res.status(200).json({ ok: true, already: true });
      return;
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'https://finanzasav.vercel.app',
      process.env.VITE_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
    const { data: admins } = await supabase.from('platform_admins').select('user_id');
    const adminIds = (admins || []).map((a) => a.user_id).filter((id) => id !== s.user_id);
    const payload = JSON.stringify({ title: 'Nueva sugerencia', body: s.title, url: '/#/admin' });

    let sent = 0;
    for (const adminId of adminIds) {
      const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', adminId);
      for (const sub of subs || []) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          sent++;
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          }
        }
      }
    }
    res.status(200).json({ ok: true, sent });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al notificar.' });
  }
}
