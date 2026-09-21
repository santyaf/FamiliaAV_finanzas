import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendNotification = vi.fn();
let fakeDb;

vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: (...a) => sendNotification(...a) } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeDb }));

// Base falsa mínima: tablas en memoria, filtros eq/neq y registro de escrituras.
function makeDb(tables, errors = {}) {
  const writes = [];
  return {
    writes,
    from(name) {
      let rows = tables[name] || [];
      const err = errors[name] ? { message: errors[name] } : null;
      const record = (op, payload) => { writes.push({ table: name, op, payload }); };
      const b = {
        select: () => b,
        not: () => b,
        eq: (k, v) => { rows = rows.filter((r) => r[k] === v); return b; },
        neq: (k, v) => { rows = rows.filter((r) => r[k] !== v); return b; },
        insert: (p) => { record('insert', p); return b; },
        upsert: (p) => { record('upsert', p); return b; },
        update: (p) => { record('update', p); return b; },
        delete: () => { record('delete'); return b; },
        maybeSingle: () => Promise.resolve({ data: err ? null : rows[0] || null, error: err }),
        then: (res, rej) => Promise.resolve({ data: err ? null : rows, error: err }).then(res, rej),
      };
      return b;
    },
  };
}

const makeRes = () => { const r = { statusCode: null, body: null }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const req = (query = {}) => ({ headers: { authorization: 'Bearer s3cret' }, query });

const baseTables = () => ({
  reminder_schedules: [
    { id: 's-a', user_id: 'A', enabled: true, timezone: 'America/Bogota', time_of_day: '08:00:00', label: 'Registra tus movimientos' },
    { id: 's-b', user_id: 'B', enabled: true, timezone: 'America/Bogota', time_of_day: '08:00:00', label: 'Registra tus movimientos' },
  ],
  profiles: [{ id: 'A', status: 'active' }, { id: 'B', status: 'deactivated' }, { id: 'C', status: 'suspended' }],
  push_subscriptions: [
    { user_id: 'A', endpoint: 'https://push/a', p256dh: 'k', auth: 'a' },
    { user_id: 'B', endpoint: 'https://push/b', p256dh: 'k', auth: 'a' },
  ],
});

let handler;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-21T13:02:00Z')); // 08:02 en Bogotá, lunes
  Object.assign(process.env, {
    REMINDER_CRON_SECRET: 's3cret', SUPABASE_SERVICE_ROLE_KEY: 'x', VITE_SUPABASE_URL: 'https://x.supabase.co',
    VITE_VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv',
  });
  sendNotification.mockReset().mockResolvedValue({});
  handler = (await import('./send-reminders.js')).default;
});
afterEach(() => vi.useRealTimers());

describe('send-reminders', () => {
  it('rechaza sin el token del cron', async () => {
    fakeDb = makeDb(baseTables());
    const res = makeRes();
    await handler({ headers: {}, query: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('envía a las cuentas activas y no a las desactivadas o suspendidas', async () => {
    fakeDb = makeDb(baseTables());
    const res = makeRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0][0].endpoint).toBe('https://push/a');
    expect(res.body.sent).toBe(1);
    expect(res.body.extras.digest.checked).toBe(1); // solo A: B ya no cuenta como destinataria
  });

  it('deja el latido tras una ejecución real', async () => {
    fakeDb = makeDb(baseTables());
    await handler(req(), makeRes());
    const beat = fakeDb.writes.find((w) => w.table === 'cron_heartbeat');
    expect(beat.op).toBe('upsert');
    expect(beat.payload).toMatchObject({ job: 'send-reminders', last_ok: true, sent: 1 });
    expect(beat.payload.last_run_at).toBe('2026-09-21T13:02:00.000Z');
  });

  it('en simulación (dry) o forzado no toca el latido ni envía', async () => {
    fakeDb = makeDb(baseTables());
    await handler(req({ dry: '1' }), makeRes());
    expect(sendNotification).not.toHaveBeenCalled();
    expect(fakeDb.writes.some((w) => w.table === 'cron_heartbeat')).toBe(false);
    fakeDb = makeDb(baseTables());
    await handler(req({ force: '1' }), makeRes());
    expect(fakeDb.writes.some((w) => w.table === 'cron_heartbeat')).toBe(false);
  });

  it('si la consulta falla responde 500 y registra el latido con error', async () => {
    fakeDb = makeDb(baseTables(), { reminder_schedules: 'sin conexión' });
    const res = makeRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(500);
    const beat = fakeDb.writes.find((w) => w.table === 'cron_heartbeat');
    expect(beat.payload).toMatchObject({ last_ok: false, detail: 'sin conexión' });
  });

  it('una suscripción expirada se elimina y no rompe el resto', async () => {
    fakeDb = makeDb(baseTables());
    sendNotification.mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    const res = makeRes();
    await handler(req(), res);
    expect(res.statusCode).toBe(200);
    expect(fakeDb.writes.some((w) => w.table === 'push_subscriptions' && w.op === 'delete')).toBe(true);
    expect(res.body.pushErrors[0].statusCode).toBe(410);
  });
});
