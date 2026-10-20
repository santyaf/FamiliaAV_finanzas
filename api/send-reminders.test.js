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
        in: (k, list) => { rows = rows.filter((r) => list.includes(r[k])); return b; },
        is: (k, v) => { rows = rows.filter((r) => (r[k] ?? null) === v); return b; },
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

  it('reenvía por push las solicitudes de gasto una sola vez y solo a cuentas activas', async () => {
    const tables = baseTables();
    tables.notifications = [
      { id: 'n1', user_id: 'A', type: 'spend_request', title: 'Solicitud de gasto: Nevera', body: 'Beto pide tu visto bueno', pushed_at: null },
      { id: 'n2', user_id: 'B', type: 'spend_decision', title: 'Solicitud aprobada', body: 'x', pushed_at: null }, // B está desactivada
      { id: 'n3', user_id: 'A', type: 'budget_projection', title: 'Otro tipo', body: 'x', pushed_at: null }, // no es de aprobaciones
      { id: 'n4', user_id: 'A', type: 'spend_request', title: 'Ya enviada', body: 'x', pushed_at: '2026-09-20T00:00:00Z' },
    ];
    fakeDb = makeDb(tables);
    const res = makeRes();
    await handler(req(), res);
    const bodies = sendNotification.mock.calls.map((c) => JSON.parse(c[1]));
    expect(bodies.filter((b) => b.url === '/#/aprobaciones').map((b) => b.title)).toEqual(['Solicitud de gasto: Nevera']);
    expect(res.body.extras.approvals).toEqual({ checked: 2, sent: 1 });
    const marks = fakeDb.writes.filter((w) => w.table === 'notifications' && w.op === 'update');
    expect(marks).toHaveLength(2); // n1 y n2 quedan marcadas (n2 no se envía pero tampoco se reintenta cada 5 min)
  });

  it('en simulación no envía ni marca los avisos', async () => {
    const tables = baseTables();
    tables.notifications = [{ id: 'n1', user_id: 'A', type: 'spend_request', title: 't', body: 'b', pushed_at: null }];
    fakeDb = makeDb(tables);
    await handler(req({ dry: '1' }), makeRes());
    expect(sendNotification).not.toHaveBeenCalled();
    expect(fakeDb.writes.some((w) => w.table === 'notifications')).toBe(false);
  });

  describe('aviso del dólar', () => {
    const trmResponse = (value) => ({ ok: true, status: 200, json: async () => [{ valor: String(value), vigenciadesde: '2026-09-21T00:00:00.000' }] });
    const fxTables = (over = {}) => ({
      ...baseTables(),
      reminder_schedules: [], // sin recordatorios: solo importa el aviso del dólar
      profiles: [{ id: 'A', status: 'active' }, { id: 'B', status: 'active' }, { id: 'C', status: 'deactivated' }],
      investment_settings: [{ household_id: 'H1', fx_alert: true }],
      holdings: [{ id: 'hu', household_id: 'H1', owner_member_id: null, asset_class: 'divisa', archived: false }],
      holding_trades: [{ id: 't1', holding_id: 'hu', trade_date: '2026-01-10', side: 'compra', units: 100, cop_amount: 400000, created_at: '1' }],
      household_members: [{ household_id: 'H1', user_id: 'A' }, { household_id: 'H1', user_id: 'B' }, { household_id: 'H1', user_id: 'C' }],
      ...over,
    });
    const upserts = () => fakeDb.writes.filter((w) => w.table === 'notifications' && w.op === 'upsert');
    afterEach(() => vi.unstubAllGlobals());

    it('si la TRM supera el costo promedio, avisa a cada integrante activo una vez por día', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(trmResponse(4200)));
      fakeDb = makeDb(fxTables());
      const res = makeRes();
      await handler(req(), res);
      expect(res.body.extras.fx).toMatchObject({ households: 1, created: 2, trm: 4200 }); // A y B; C está desactivada
      const rows = upserts()[0].payload;
      expect(rows.map((r) => r.user_id).sort()).toEqual(['A', 'B']);
      expect(rows[0]).toMatchObject({ household_id: 'H1', type: 'fx_opportunity', title: 'El dólar superó tu tasa promedio' });
      expect(rows[0].dedupe_key).toBe('fx:hu:2026-09-21:A');
      expect(rows[0].body).toMatch(/4\.200,00 contra tu promedio de 4\.000,00/);
      expect(rows[0].body).toMatch(/20\.000/); // 100 USD × 200
      expect(upserts()[0].payload).toBeDefined();
    });
    it('una posición personal avisa solo a su dueño', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(trmResponse(4200)));
      fakeDb = makeDb(fxTables({ holdings: [{ id: 'hu', household_id: 'H1', owner_member_id: 'B', asset_class: 'divisa', archived: false }] }));
      await handler(req(), makeRes());
      expect(upserts()[0].payload.map((r) => r.user_id)).toEqual(['B']);
    });
    it('con la TRM por debajo del costo no avisa', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(trmResponse(3900)));
      fakeDb = makeDb(fxTables());
      const res = makeRes();
      await handler(req(), res);
      expect(upserts()).toHaveLength(0);
      expect(res.body.extras.fx.created).toBe(0);
    });
    it('sin hogares con la alerta activada ni siquiera consulta la TRM', async () => {
      const f = vi.fn();
      vi.stubGlobal('fetch', f);
      fakeDb = makeDb(fxTables({ investment_settings: [{ household_id: 'H1', fx_alert: false }] }));
      await handler(req(), makeRes());
      expect(f).not.toHaveBeenCalled();
    });
    it('una venta total deja la posición en cero: no hay aviso', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(trmResponse(4200)));
      fakeDb = makeDb(fxTables({ holding_trades: [
        { id: 't1', holding_id: 'hu', trade_date: '2026-01-10', side: 'compra', units: 100, cop_amount: 400000, created_at: '1' },
        { id: 't2', holding_id: 'hu', trade_date: '2026-02-10', side: 'venta', units: 100, cop_amount: 410000, created_at: '2' },
      ] }));
      await handler(req(), makeRes());
      expect(upserts()).toHaveLength(0);
    });
    it('en simulación no escribe nada', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(trmResponse(4200)));
      fakeDb = makeDb(fxTables());
      await handler(req({ dry: '1' }), makeRes());
      expect(upserts()).toHaveLength(0);
    });
    it('si la TRM falla, lo anota pero el resto del cron sigue', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
      fakeDb = makeDb(fxTables());
      const res = makeRes();
      await handler(req(), res);
      expect(res.statusCode).toBe(200);
      expect(res.body.extras.fx.error).toMatch(/TRM/);
      expect(res.body.extras.error).toBeNull();
    });
    it('el aviso llega al celular con el enlace a Activos, una sola vez', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(trmResponse(4200)));
      fakeDb = makeDb(fxTables({
        notifications: [{ id: 'n9', user_id: 'A', type: 'fx_opportunity', title: 'El dólar superó tu tasa promedio', body: 'x', pushed_at: null }],
      }));
      await handler(req(), makeRes());
      const payload = JSON.parse(sendNotification.mock.calls.at(-1)[1]);
      expect(payload.url).toBe('/#/activos');
      expect(fakeDb.writes.some((w) => w.table === 'notifications' && w.op === 'update')).toBe(true);
    });
  });

  describe('ahorro de consultas en cada corrida', () => {
    const tablesAt = () => ({ ...baseTables(), reminder_schedules: [
      { id: 's-x', user_id: 'A', enabled: true, timezone: 'America/Bogota', time_of_day: '19:20:00', label: 'Registra tus movimientos' },
    ] });
    const fetchCalls = [];
    beforeEach(() => { fetchCalls.length = 0; vi.stubGlobal('fetch', vi.fn(async (...a) => { fetchCalls.push(a[0]); return { ok: true, status: 200, json: async () => [{ valor: '4200', vigenciadesde: '2026-09-21T00:00:00.000' }] }; })); });
    afterEach(() => vi.unstubAllGlobals());

    it('un recordatorio a las 19:20 sale en la corrida de las 19:30 (el cron corre cada 15 min)', async () => {
      vi.setSystemTime(new Date('2026-09-22T00:30:05Z')); // 19:30 en Bogotá
      fakeDb = makeDb(tablesAt());
      const res = makeRes();
      await handler(req(), res);
      expect(res.body.sent).toBe(1);
      expect(res.body.evaluated[0].diffMin).toBe(10);
    });
    it('pasada la ventana de 15 minutos, ya no', async () => {
      vi.setSystemTime(new Date('2026-09-22T00:50:00Z')); // 19:50
      fakeDb = makeDb(tablesAt());
      const res = makeRes();
      await handler(req(), res);
      expect(res.body.sent).toBe(0);
      expect(res.body.evaluated[0].result).toBe('ya-pasó-la-ventana');
    });

    it('la alerta del dólar solo consulta la TRM por la mañana', async () => {
      const tables = () => ({ ...baseTables(), reminder_schedules: [], investment_settings: [{ household_id: 'H1', fx_alert: true }], holdings: [], holding_trades: [], household_members: [] });
      vi.setSystemTime(new Date('2026-09-21T18:00:00Z')); // 13:00 en Bogotá
      fakeDb = makeDb(tables());
      await handler(req(), makeRes());
      expect(fetchCalls).toHaveLength(0);
      vi.setSystemTime(new Date('2026-09-21T13:10:00Z')); // 08:10 en Bogotá
      fakeDb = makeDb(tables());
      await handler(req(), makeRes());
      expect(fetchCalls.length).toBeGreaterThan(0);
      fetchCalls.length = 0;
      vi.setSystemTime(new Date('2026-09-21T14:00:00Z')); // 09:00: la corrida de la mañana también la evalúa
      fakeDb = makeDb(tables());
      await handler(req(), makeRes());
      expect(fetchCalls.length).toBeGreaterThan(0);
    });

    it('el resumen mensual no consulta su registro fuera de los primeros 5 días del mes', async () => {
      const queried = [];
      const base = makeDb({ ...baseTables(), reminder_schedules: [] });
      fakeDb = { ...base, from: (name) => { queried.push(name); return base.from(name); } };
      vi.setSystemTime(new Date('2026-09-21T18:00:00Z')); // día 21
      await handler(req(), makeRes());
      expect(queried).not.toContain('digest_sent_log');
      queried.length = 0;
      vi.setSystemTime(new Date('2026-09-02T18:00:00Z')); // día 2, después de las 9:00
      await handler(req(), makeRes());
      expect(queried).toContain('digest_sent_log');
    });
  });
});
