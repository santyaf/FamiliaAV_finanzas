-- Latido del cron de recordatorios: cada ejecución deja su huella para que Administración avise si se detiene.
create table if not exists public.cron_heartbeat (
  job text primary key,
  last_run_at timestamptz not null default now(),
  last_ok boolean not null default true,
  sent integer not null default 0,
  detail text,
  duration_ms integer
);
alter table public.cron_heartbeat enable row level security;
drop policy if exists "admins ven el latido" on public.cron_heartbeat;
create policy "admins ven el latido" on public.cron_heartbeat for select using (public.is_platform_admin());
-- solo el service role (el endpoint del cron) escribe: sin políticas de escritura para usuarios
revoke all on public.cron_heartbeat from anon;
revoke insert, update, delete on public.cron_heartbeat from authenticated;
