-- =========================================================
-- FASE 4 — PARAMETRIZACIÓN DE NOTIFICACIONES
-- =========================================================
-- activar/desactivar cada tipo de alerta, a nivel de plataforma (superusuario)
insert into app_settings (key, value) values
  ('notif_budget_projection_enabled', 'true'),
  ('notif_goal_pace_enabled', 'true'),
  ('notif_extra_income_enabled', 'true'),
  ('notif_credit_due_enabled', 'true'),
  ('notif_surplus_opportunity_enabled', 'true')
on conflict (key) do nothing;

-- y a nivel de cada usuario (si el admin la dejó activada globalmente, cada quien puede apagarla para sí)
create table if not exists user_notification_prefs (
  user_id uuid references profiles(id) on delete cascade,
  type text not null,
  enabled boolean not null default true,
  primary key (user_id, type)
);
alter table user_notification_prefs enable row level security;
drop policy if exists "ver mis preferencias" on user_notification_prefs;
create policy "ver mis preferencias" on user_notification_prefs for select using (user_id = auth.uid());
drop policy if exists "escribir mis preferencias" on user_notification_prefs;
create policy "escribir mis preferencias" on user_notification_prefs for insert with check (user_id = auth.uid());
drop policy if exists "actualizar mis preferencias" on user_notification_prefs;
create policy "actualizar mis preferencias" on user_notification_prefs for update using (user_id = auth.uid());
