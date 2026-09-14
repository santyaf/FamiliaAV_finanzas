-- =========================================================
-- FASE 9 — NOTIFICACIONES PUSH: RECORDATORIOS PARAMETRIZABLES
-- =========================================================

-- una fila por dispositivo/navegador donde el usuario activó las notificaciones
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
alter table push_subscriptions enable row level security;
drop policy if exists "ver mis suscripciones" on push_subscriptions;
create policy "ver mis suscripciones" on push_subscriptions for select using (user_id = auth.uid());
drop policy if exists "crear mi suscripcion" on push_subscriptions;
create policy "crear mi suscripcion" on push_subscriptions for insert with check (user_id = auth.uid());
drop policy if exists "borrar mi suscripcion" on push_subscriptions;
create policy "borrar mi suscripcion" on push_subscriptions for delete using (user_id = auth.uid());

-- cada usuario puede crear varios recordatorios (hora + días de la semana)
create table if not exists reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  label text not null default 'Registrar movimientos',
  time_of_day text not null,          -- 'HH:MM' en la hora LOCAL del usuario
  timezone text not null,             -- IANA, ej. 'America/Bogota'
  days_of_week int[] not null default '{0,1,2,3,4,5,6}',  -- 0=domingo … 6=sábado
  enabled boolean not null default true,
  created_at timestamptz default now()
);
alter table reminder_schedules enable row level security;
drop policy if exists "ver mis recordatorios" on reminder_schedules;
create policy "ver mis recordatorios" on reminder_schedules for select using (user_id = auth.uid());
drop policy if exists "crear mi recordatorio" on reminder_schedules;
create policy "crear mi recordatorio" on reminder_schedules for insert with check (user_id = auth.uid());
drop policy if exists "editar mi recordatorio" on reminder_schedules;
create policy "editar mi recordatorio" on reminder_schedules for update using (user_id = auth.uid());
drop policy if exists "borrar mi recordatorio" on reminder_schedules;
create policy "borrar mi recordatorio" on reminder_schedules for delete using (user_id = auth.uid());

-- evita reenviar el mismo recordatorio dos veces el mismo día
create table if not exists reminder_sent_log (
  schedule_id uuid references reminder_schedules(id) on delete cascade,
  sent_date date not null,
  sent_at timestamptz default now(),
  primary key (schedule_id, sent_date)
);
alter table reminder_sent_log enable row level security;
-- esta tabla la escribe únicamente la función serverless con la service role key
-- (que salta RLS por diseño); no necesita políticas para el cliente.
