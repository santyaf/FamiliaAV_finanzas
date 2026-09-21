import { describe, it, expect, vi, beforeEach } from 'vitest';

// cliente de Supabase falso: getUser, profiles y api_hit controlables desde cada prueba
const state = { user: { id: 'u1' }, status: 'active', hit: { allowed: true }, hitError: null };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => (state.user ? { data: { user: state.user }, error: null } : { data: null, error: { message: 'x' } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: state.status } }) }) }) }),
    rpc: async () => (state.hitError ? { data: null, error: state.hitError } : { data: state.hit, error: null }),
  }),
}));

const { requireAuth, checkRateLimit } = await import('./_auth.js');

const mkRes = () => {
  const res = { headers: {}, statusCode: null, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const req = { headers: { authorization: 'Bearer token' } };
const limit = { endpoint: 'ai-parse', hourly: 60, daily: 300 };

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://x.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon';
  Object.assign(state, { user: { id: 'u1' }, status: 'active', hit: { allowed: true }, hitError: null });
});

describe('requireAuth', () => {
  it('sin token responde 401', async () => {
    const res = mkRes();
    expect(await requireAuth({ headers: {} }, res)).toBe(true);
    expect(res.statusCode).toBe(401);
  });
  it('con sesión válida deja pasar y guarda el usuario', async () => {
    const res = mkRes(); const r = { headers: { authorization: 'Bearer t' } };
    expect(await requireAuth(r, res)).toBe(false);
    expect(r.user.id).toBe('u1');
  });
  it('una cuenta suspendida o desactivada no pasa', async () => {
    state.status = 'suspended';
    const res = mkRes();
    expect(await requireAuth(req, res)).toBe(true);
    expect(res.statusCode).toBe(401);
  });
});

describe('límite de uso', () => {
  it('dentro del límite pasa', async () => {
    const res = mkRes();
    expect(await requireAuth({ ...req }, res, { limit })).toBe(false);
  });
  it('al pasarse por hora responde 429 con Retry-After y mensaje claro', async () => {
    state.hit = { allowed: false, reason: 'hourly', retry_after: 1200 };
    const res = mkRes();
    expect(await requireAuth({ ...req }, res, { limit })).toBe(true);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('1200');
    expect(res.body.error).toMatch(/20 min/);
  });
  it('al pasarse por día lo dice', async () => {
    state.hit = { allowed: false, reason: 'daily', retry_after: 40000 };
    const res = mkRes();
    await requireAuth({ ...req }, res, { limit });
    expect(res.body.error).toMatch(/límite diario/);
  });
  it('si el contador falla NO bloquea (fail-open)', async () => {
    state.hitError = { message: 'db caída' };
    const res = mkRes();
    expect(await requireAuth({ ...req }, res, { limit })).toBe(false);
    expect((await checkRateLimit(req, limit)).allowed).toBe(true);
  });
  it('sin configuración de límite no consulta nada', async () => {
    state.hit = { allowed: false, reason: 'hourly', retry_after: 1 };
    const res = mkRes();
    expect(await requireAuth({ ...req }, res)).toBe(false);
  });
});
