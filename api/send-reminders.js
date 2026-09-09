// Se llama externamente (GitHub Actions, cada 5 minutos) — Vercel Hobby no permite
// cron nativo más frecuente que una vez al día. Revisa, para cada recordatorio activo,
// si la hora local del usuario (según su zona horaria guardada) cayó dentro de la
// ventana desde la última revisión, y si no se ha enviado ya hoy, envía el push.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const CHECK_WINDOW_MINUTES = 6; // un poco más que los 5 min entre corridas, por margen

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${process.env.REMINDER_CRON_SECRET}`) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel.' });
    return;
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  webpush.setVapidDetails(
    'mailto:soporte@finanzas-del-hogar.app',
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  try {
    const { data: schedules, error } = await supabase.from('reminder_schedules').select('*').eq('enabled', true);
    if (error) throw error;

    const now = new Date();
    let sent = 0, skipped = 0, due = 0;

    for (const s of schedules) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: s.timezone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', weekday: 'short',
      }).formatToParts(now);
      const get = (type) => parts.find((p) => p.type === type)?.value;
      const localDateStr = `${get('year')}-${get('month')}-${get('day')}`;
      const localHour = parseInt(get('hour'), 10);
      const localMinute = parseInt(get('minute'), 10);
      const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const localWeekday = weekdayMap[get('weekday')];

      if (!s.days_of_week.includes(localWeekday)) continue;

      const [schedH, schedM] = s.time_of_day.split(':').map(Number);
      const diff = (localHour * 60 + localMinute) - (schedH * 60 + schedM);
      if (diff < 0 || diff > CHECK_WINDOW_MINUTES) continue;

      due++;

      const { data: already } = await supabase
        .from('reminder_sent_log').select('schedule_id')
        .eq('schedule_id', s.id).eq('sent_date', localDateStr).maybeSingle();
      if (already) { skipped++; continue; }

      const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', s.user_id);
      if (subs?.length) {
        const payload = JSON.stringify({
          title: 'Finanzas del Hogar',
          body: s.label || '¿Ya registraste tus movimientos de hoy?',
        });
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
            sent++;
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
            }
          }
        }
      }
      // se marca como enviado aunque el usuario no tenga ninguna suscripción activa,
      // para no reintentar el resto del día
      await supabase.from('reminder_sent_log').insert({ schedule_id: s.id, sent_date: localDateStr });
    }

    res.status(200).json({ ok: true, checked: schedules.length, due, sent, skipped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
