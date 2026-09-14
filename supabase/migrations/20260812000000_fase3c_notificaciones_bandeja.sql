-- =========================================================
-- FASE 3c — NOTIFICACIONES (bandeja dentro de la app)
-- =========================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  user_id uuid references profiles(id),         -- null = para todo el hogar
  type text not null,                            -- 'budget_projection' | 'goal_pace' | 'surplus_opportunity' | 'extra_income' | 'credit_due'
  title text not null,
  body text not null,
  data jsonb,
  dedupe_key text not null,                      -- evita duplicados (ej. "budget:<id>:2026-08")
  read boolean not null default false,
  created_at timestamptz default now(),
  unique (household_id, dedupe_key)
);

alter table notifications enable row level security;
drop policy if exists "ver notificaciones" on notifications;
create policy "ver notificaciones" on notifications for select using (
  public.is_household_member(household_id) and (user_id is null or user_id = auth.uid())
);
drop policy if exists "crear notificaciones" on notifications;
create policy "crear notificaciones" on notifications for insert with check (public.is_household_member(household_id));
drop policy if exists "marcar notificaciones" on notifications;
create policy "marcar notificaciones" on notifications for update using (
  public.is_household_member(household_id) and (user_id is null or user_id = auth.uid())
);
drop policy if exists "borrar notificaciones" on notifications;
create policy "borrar notificaciones" on notifications for delete using (
  public.is_household_member(household_id) and (user_id is null or user_id = auth.uid())
);
