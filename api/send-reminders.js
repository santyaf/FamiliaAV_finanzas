// Se llama externamente (GitHub Actions / cron-job.org, cada pocos minutos) —
// Vercel Hobby no permite cron nativo más frecuente que una vez al día.
// Revisa, para cada recordatorio activo, si la hora local del usuario (según su
// zona horaria guardada) cayó dentro de la ventana desde la última revisión, y
// si no se ha enviado ya hoy, envía el push.
//
// Diagnóstico:
//   POST /api/send-reminders            → corrida normal
//   POST /api/send-reminders?dry=1      → NO envía nada, solo reporta qué haría
//   POST /api/send-reminders?force=1    → ignora la ventana horaria y el "ya enviado hoy"
//                                         (para probar: siempre intenta enviar)
// Siempre requiere  Authorization: Bearer <REMINDER_CRON_SECRET>.
// La respuesta incluye `env` con qué variables están configuradas (sin exponer
// sus valores) para poder depurar desde el log del workflow.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const CHECK_WINDOW_MINUTES = 6; // un poco más que los ~5 min entre corridas, por margen

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    res.status(401).json({
      error: 'No autorizado',
      hint: secret
        ? 'El token enviado no coincide con REMINDER_CRON_SECRET en Vercel.'
        : 'REMINDER_CRON_SECRET no está configurada en Vercel.',
    });
    return;
  }

  const env = {
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
    VITE_VAPID_PUBLIC_KEY: !!process.env.VITE_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
  };
  const missing = Object.entries(env).filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) {
    res.status(500).json({ error: 'Faltan variables de entorno en Vercel', missing, env });
    return;
  }

  const dry = req.query?.dry === '1' || req.query?.dry === 'true';
  const force = req.query?.force === '1' || req.query?.force === 'true';

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    webpush.setVapidDetails(
      'mailto:soporte@finanzas-del-hogar.app',
      process.env.VITE_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    );
  } catch (err) {
    res.status(500).json({ error: 'Claves VAPID inválidas: ' + err.message, env });
    return;
  }

  try {
    const { data: schedules, error } = await supabase
      .from('reminder_schedules').select('*').eq('enabled', true);
    if (error) throw error;

    const now = new Date();
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let sent = 0, skipped = 0, due = 0;
    const pushErrors = [];
    const evaluated = [];

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
      const localWeekday = weekdayMap[get('weekday')];
      const [schedH, schedM] = String(s.time_of_day).split(':').map(Number);
      const diff = (localHour * 60 + localMinute) - (schedH * 60 + schedM);
      const days = Array.isArray(s.days_of_week) ? s.days_of_week : [0, 1, 2, 3, 4, 5, 6];

      const info = {
        id: s.id, label: s.label, tz: s.timezone,
        localTime: `${get('hour')}:${get('minute')}`, target: s.time_of_day,
        diffMin: diff, weekdayOk: days.includes(localWeekday),
      };

      if (!force && !days.includes(localWeekday)) { info.result = 'no-hoy'; evaluated.push(info); continue; }
      if (!force && (diff < 0 || diff > CHECK_WINDOW_MINUTES)) {
        info.result = diff < 0 ? 'aún-no' : 'ya-pasó-la-ventana';
        evaluated.push(info);
        continue;
      }

      due++;

      if (!force) {
        const { data: already } = await supabase
          .from('reminder_sent_log').select('schedule_id')
          .eq('schedule_id', s.id).eq('sent_date', localDateStr).maybeSingle();
        if (already) { skipped++; info.result = 'ya-enviado-hoy'; evaluated.push(info); continue; }
      }

      const { data: subs } = await supabase
        .from('push_subscriptions').select('*').eq('user_id', s.user_id);
      info.subs = subs?.length || 0;

      if (!dry && subs?.length) {
        const payload = JSON.stringify({
          title: 'Finanzas del Hogar',
          body: s.label || '¿Ya registraste tus movimientos de hoy?',
        });
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            );
            sent++;
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
              pushErrors.push({ schedule: s.id, statusCode: err.statusCode, note: 'suscripción expirada, eliminada' });
            } else {
              pushErrors.push({ schedule: s.id, statusCode: err.statusCode, message: err.body || err.message });
            }
          }
        }
      }

      if (!dry && !force) {
        await supabase.from('reminder_sent_log').insert({ schedule_id: s.id, sent_date: localDateStr });
      }
      info.result = dry ? 'se-enviaría' : 'enviado';
      evaluated.push(info);
    }

    res.status(200).json({
      ok: true, dry, force,
      serverTimeUTC: now.toISOString(),
      checked: schedules.length, due, sent, skipped,
      pushErrors, evaluated, env,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, env });
  }
}
