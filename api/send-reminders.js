// Se llama externamente (cron-job.org) — Vercel Hobby no permite cron nativo más frecuente que una vez al día.
// Para gastar poca CPU corre pocas veces al día, a las horas de los recordatorios (hoy 9:00, 12:00 y 19:30 de Colombia,
// con la ventana de CHECK_WINDOW_MINUTES). Un recordatorio solo sale si una corrida cae en su ventana: al cambiar las
// horas de los recordatorios o de las obligaciones hay que ajustar también las horas del trabajo en cron-job.org.
// Revisa, para cada recordatorio activo, si la hora local del usuario (según su
// zona horaria guardada) cayó dentro de la ventana desde la última revisión, y
// si no se ha enviado ya hoy, envía el push. También revisa las Obligaciones
// (Fase 12) — pagos recurrentes con su propia fecha/hora de recordatorio.
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
import { advanceByFrequency } from '../src/lib/finance.js';
import { computePosition, fxOpportunity } from '../src/lib/portfolio.js';
import { fetchTrm } from './_trm.js';
import { localParts, previousMonthOf, shouldSendDigest, cardPaymentAlert, cardAlertText, DEFAULT_TIMEZONE } from '../src/lib/pushSchedule.js';

// El cron externo corre cada 15 min: la ventana debe cubrir ese intervalo (menos 1 min) para que un recordatorio a una hora
// que no sea :00/:15/:30/:45 igual salga en la corrida siguiente. Los registros de "ya enviado hoy" evitan los duplicados.
const CHECK_WINDOW_MINUTES = 14;

// Envía un push a cada suscripción de un usuario; limpia las que ya expiraron.
async function sendToUser(supabase, userId, payload, pushErrors, context) {
  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId);
  let sent = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        pushErrors.push({ context, statusCode: err.statusCode, note: 'suscripción expirada, eliminada' });
      } else {
        pushErrors.push({ context, statusCode: err.statusCode, message: err.body || err.message });
      }
    }
  }
  return { sent, subsCount: subs?.length || 0 };
}

// Latido: deja constancia de cada ejecución real para que Administración avise si el cron se detiene.
async function heartbeat(supabase, { ok, sent = 0, detail = null, startedAt }) {
  try {
    await supabase.from('cron_heartbeat').upsert({
      job: 'send-reminders', last_run_at: new Date().toISOString(), last_ok: ok, sent, detail: detail ? String(detail).slice(0, 300) : null,
      duration_ms: Date.now() - startedAt,
    });
  } catch { /* el latido nunca debe romper el envío */ }
}

export default async function handler(req, res) {
  const startedAt = Date.now();
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
    // El "subject" del JWT VAPID: Apple exige un mailto: o una URL https válida.
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'https://finanzasav.vercel.app',
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

    // Las cuentas desactivadas o suspendidas no reciben avisos.
    const { data: inactiveRows } = await supabase.from('profiles').select('id').neq('status', 'active');
    const inactive = new Set((inactiveRows || []).map((r) => r.id));
    const send = (uid, payload, errors, context) => (inactive.has(uid) ? { sent: 0, subsCount: 0 } : sendToUser(supabase, uid, payload, errors, context));

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

      const { data: subRowsOfUser } = await supabase
        .from('push_subscriptions').select('*').eq('user_id', s.user_id);
      const subs = inactive.has(s.user_id) ? [] : subRowsOfUser;
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

    // ---- Obligaciones (Fase 12): pagos recurrentes con su propia fecha ----
    const { data: obligations, error: obError } = await supabase
      .from('obligations').select('*').eq('enabled', true);
    if (obError) throw obError;

    let obSent = 0, obSkipped = 0, obDue = 0;
    const obligationsEvaluated = [];

    for (const o of obligations) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: o.timezone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).formatToParts(now);
      const get = (type) => parts.find((p) => p.type === type)?.value;
      const localDateStr = `${get('year')}-${get('month')}-${get('day')}`;
      const localHour = parseInt(get('hour'), 10);
      const localMinute = parseInt(get('minute'), 10);
      const [obH, obM] = String(o.time_of_day).split(':').map(Number);
      const diff = (localHour * 60 + localMinute) - (obH * 60 + obM);
      const dateReached = localDateStr >= o.next_due_date;
      // si ya pasó el día (ej. el cron estuvo caído), no esperamos a que vuelva
      // a ser la hora exacta — se avisa en cuanto se vuelva a revisar.
      const overdue = localDateStr > o.next_due_date;
      const timeOk = overdue || (diff >= 0 && diff <= CHECK_WINDOW_MINUTES);

      const info = {
        id: o.id, name: o.name, tz: o.timezone,
        localDate: localDateStr, nextDueDate: o.next_due_date,
        localTime: `${get('hour')}:${get('minute')}`, target: o.time_of_day, diffMin: diff,
      };

      if (!force && !dateReached) { info.result = 'aún-no'; obligationsEvaluated.push(info); continue; }
      if (!force && !timeOk) { info.result = 'ya-pasó-la-ventana'; obligationsEvaluated.push(info); continue; }

      obDue++;

      if (!force) {
        const { data: already } = await supabase
          .from('obligation_sent_log').select('obligation_id')
          .eq('obligation_id', o.id).eq('sent_date', localDateStr).maybeSingle();
        if (already) { obSkipped++; info.result = 'ya-enviado-hoy'; obligationsEvaluated.push(info); continue; }
      }

      const recipients = o.owner_member_id
        ? [o.owner_member_id]
        : ((await supabase.from('household_members').select('user_id').eq('household_id', o.household_id)).data || []).map((m) => m.user_id);
      info.recipients = recipients.length;

      if (!dry && recipients.length) {
        const amountLabel = o.amount == null ? 'Monto variable' : `$${new Intl.NumberFormat('es-CO').format(o.amount)}`;
        const payload = JSON.stringify({
          title: `Obligación: ${o.name}`,
          body: `${amountLabel}${o.note ? ' — ' + o.note : ''} · toca para registrar el gasto`,
          url: `/#/movimientos?ob=${o.id}`,
        });
        for (const userId of recipients) {
          const { sent: n } = await send(userId, payload, pushErrors, `obligation:${o.id}`);
          obSent += n;
        }
      }

      // force: solo envía una prueba, no toca el estado guardado (ni el log
      // ni la fecha del próximo recordatorio) — igual que con reminder_schedules.
      if (!dry && !force) {
        await supabase.from('obligation_sent_log').insert({ obligation_id: o.id, sent_date: localDateStr });
        await supabase.from('obligations')
          .update({ next_due_date: advanceByFrequency(o.next_due_date, o.frequency) })
          .eq('id', o.id);
      }
      info.result = dry ? 'se-enviaría' : 'enviado';
      obligationsEvaluated.push(info);
    }

    // ---- Resumen mensual y vencimiento de tarjetas (Fase 29). Un fallo aquí no afecta a lo anterior. ----
    const extras = { digest: { checked: 0, sent: 0, skipped: 0 }, cards: { checked: 0, sent: 0, skipped: 0 }, approvals: { checked: 0, sent: 0 }, fx: { households: 0, created: 0, trm: null }, error: null };
    try {
      const tzByUser = {};
      [...(schedules || []), ...(obligations || [])].forEach((x) => { const uid = x.user_id || x.owner_member_id; if (uid && x.timezone && !tzByUser[uid]) tzByUser[uid] = x.timezone; });
      const tzOf = (uid) => tzByUser[uid] || DEFAULT_TIMEZONE;

      // resumen del mes anterior: un aviso general (sin cifras) por persona y mes
      const { data: subRows } = await supabase.from('push_subscriptions').select('user_id');
      const subscribed = [...new Set((subRows || []).map((r) => r.user_id))].filter((id) => !inactive.has(id));
      for (const userId of subscribed) {
        extras.digest.checked++;
        const local = localParts(now, tzOf(userId));
        // primero lo barato (sin base de datos): fuera de los primeros 5 días del mes nadie recibe el resumen
        if (!force && !shouldSendDigest(local, false)) { extras.digest.skipped++; continue; }
        const { data: sentRow } = await supabase.from('digest_sent_log').select('user_id').eq('user_id', userId).eq('month_key', local.monthKey).maybeSingle();
        if (!force && sentRow) { extras.digest.skipped++; continue; }
        const prev = previousMonthOf(local.monthKey);
        const title = `Cerró ${prev.label}`;
        const body = 'Revisa el resumen del mes y las decisiones para el siguiente en la reunión mensual.';
        if (!dry) {
          const { sent: n } = await send(userId, JSON.stringify({ title, body, url: '/#/reunion' }), pushErrors, `digest:${userId}`);
          extras.digest.sent += n;
          if (!force) {
            await supabase.from('digest_sent_log').insert({ user_id: userId, month_key: local.monthKey });
            const { data: hh } = await supabase.from('household_members').select('household_id').eq('user_id', userId);
            for (const h of hh || []) {
              await supabase.from('notifications').upsert(
                { household_id: h.household_id, user_id: userId, type: 'monthly_review', title, body, dedupe_key: `digest:${local.monthKey}:${userId}` },
                { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true },
              );
            }
          }
        }
      }

      // vencimiento de pago de las tarjetas: desde 2 días antes, una sola vez por fecha
      const { data: cardAccounts } = await supabase.from('accounts').select('id, name, type, owner_ids, household_id, payment_day')
        .eq('payment_kind', 'tarjeta_credito').not('payment_day', 'is', null);
      for (const a of cardAccounts || []) {
        extras.cards.checked++;
        const recipients = a.type === 'shared'
          ? ((await supabase.from('household_members').select('user_id').eq('household_id', a.household_id)).data || []).map((m) => m.user_id)
          : (a.owner_ids || []);
        if (!recipients.length) continue;
        const alert = cardPaymentAlert({ paymentDay: a.payment_day }, localParts(now, tzOf(recipients[0])));
        if (!alert && !force) { extras.cards.skipped++; continue; }
        const effective = alert || { dueDate: null, daysLeft: 0 };
        if (!force) {
          const { data: done } = await supabase.from('card_alert_log').select('account_id').eq('account_id', a.id).eq('due_date', effective.dueDate).maybeSingle();
          if (done) { extras.cards.skipped++; continue; }
        }
        if (!dry) {
          const text = cardAlertText(a.name, effective);
          for (const uid of recipients) {
            const { sent: n } = await send(uid, JSON.stringify({ ...text, url: '/#/cuentas' }), pushErrors, `card:${a.id}`);
            extras.cards.sent += n;
          }
          if (!force) await supabase.from('card_alert_log').insert({ account_id: a.id, due_date: effective.dueDate });
        }
      }

      // ---- Dólar: la TRM superó el costo promedio de los dólares (Fase 37). Crea el aviso de la campana (uno por
      // persona, posición y día); el envío al celular lo hace el bloque de abajo, igual que las aprobaciones. ----
      try {
        // la TRM cambia una vez al día: se evalúa solo en las corridas de la mañana (8:00 a 12:59, hora de Colombia); el aviso
        // lleva clave por persona y día, así que repetir la evaluación no duplica nada
        const bogota = localParts(now, DEFAULT_TIMEZONE);
        const fxDue = force || (bogota.hour >= 8 && bogota.hour <= 12);
        const { data: fxHouseholds } = fxDue ? await supabase.from('investment_settings').select('household_id').eq('fx_alert', true) : { data: [] };
        const fxIds = (fxHouseholds || []).map((r) => r.household_id);
        extras.fx.households = fxIds.length;
        if (fxIds.length) {
          const trm = (await fetchTrm()).value;
          extras.fx.trm = trm;
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TIMEZONE }).format(now);
          const { data: usdHoldings } = await supabase.from('holdings').select('id, household_id, owner_member_id').eq('asset_class', 'divisa').eq('archived', false).in('household_id', fxIds);
          const holdingIds = (usdHoldings || []).map((h) => h.id);
          const { data: tradeRows } = holdingIds.length ? await supabase.from('holding_trades').select('holding_id, id, trade_date, side, units, cop_amount, created_at').in('holding_id', holdingIds) : { data: [] };
          const { data: memberRows } = await supabase.from('household_members').select('household_id, user_id').in('household_id', fxIds);
          const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
          const rate = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const rows = [];
          for (const h of usdHoldings || []) {
            const pos = computePosition((tradeRows || []).filter((t) => t.holding_id === h.id)
              .map((t) => ({ id: t.id, date: t.trade_date, side: t.side, units: Number(t.units), cop: Number(t.cop_amount), createdAt: t.created_at })));
            const opp = fxOpportunity(pos.avgCost, pos.units, trm);
            if (!opp?.above) continue;
            const recipients = h.owner_member_id ? [h.owner_member_id]
              : (memberRows || []).filter((m) => m.household_id === h.household_id).map((m) => m.user_id);
            recipients.filter((u) => !inactive.has(u)).forEach((userId) => rows.push({
              household_id: h.household_id, user_id: userId, type: 'fx_opportunity', title: 'El dólar superó tu tasa promedio',
              body: `TRM ${rate.format(trm)} contra tu promedio de ${rate.format(pos.avgCost)} (+${rate.format(opp.pct)} %). Si vendieras hoy a TRM, ganarías unos ${money.format(opp.potentialGain)}.`,
              data: { holdingId: h.id, trm }, dedupe_key: `fx:${h.id}:${today}:${userId}`,
            }));
          }
          if (rows.length && !dry) {
            await supabase.from('notifications').upsert(rows, { onConflict: 'household_id,dedupe_key', ignoreDuplicates: true });
            extras.fx.created = rows.length;
          }
        }
      } catch (fxErr) {
        extras.fx.error = fxErr.message; // un fallo del aviso del dólar no afecta a lo demás
      }

      // solicitudes de gasto y su decisión: la campana ya las tiene; aquí además llegan al celular (una sola vez)
      const { data: pending } = await supabase.from('notifications').select('id, user_id, type, title, body')
        .in('type', ['spend_request', 'spend_decision', 'fx_opportunity']).is('pushed_at', null);
      for (const n of pending || []) {
        extras.approvals.checked++;
        if (!n.user_id) continue;
        if (!dry) {
          const { sent: k } = await send(n.user_id, JSON.stringify({ title: n.title, body: n.body, url: n.type === 'fx_opportunity' ? '/#/activos' : '/#/aprobaciones' }), pushErrors, `approval:${n.id}`);
          extras.approvals.sent += k;
          if (!force) await supabase.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', n.id);
        }
      }
    } catch (err) {
      extras.error = err.message;
    }

    if (!dry && !force) {
      await heartbeat(supabase, {
        ok: !extras.error, startedAt, detail: extras.error || null,
        sent: sent + obSent + (extras.digest?.sent || 0) + (extras.cards?.sent || 0) + (extras.approvals?.sent || 0),
      });
    }

    res.status(200).json({
      ok: true, dry, force, extras,
      serverTimeUTC: now.toISOString(),
      checked: schedules.length, due, sent, skipped,
      obligations: {
        checked: obligations.length, due: obDue, sent: obSent, skipped: obSkipped,
        evaluated: obligationsEvaluated,
      },
      pushErrors, evaluated, env,
    });
  } catch (err) {
    if (!dry && !force) await heartbeat(supabase, { ok: false, detail: err.message, startedAt });
    res.status(500).json({ error: err.message, env });
  }
}
