-- Fase 20: estado de cada notificación POR PERSONA (leída / archivada / eliminada).
-- Las notificaciones del hogar (user_id null) las ven todos; antes "leída" y "borrar" eran
-- globales (uno la borraba y desaparecía para todos, y al borrarla se liberaba su dedupe_key
-- y volvía a generarse). Ahora cada quien tiene su propio estado y "eliminar" es lógico.
-- notifications.read queda como respaldo: una notificación ya marcada leída sigue leída.

create table if not exists notification_states (
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  read_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists notification_states_user_idx on notification_states (user_id);
alter table notification_states enable row level security;

drop policy if exists "ver mi estado de notificaciones" on notification_states;
create policy "ver mi estado de notificaciones" on notification_states for select using (user_id = auth.uid());
drop policy if exists "crear mi estado de notificaciones" on notification_states;
create policy "crear mi estado de notificaciones" on notification_states for insert with check (
  user_id = auth.uid()
  and exists (select 1 from notifications n where n.id = notification_states.notification_id)
);
drop policy if exists "editar mi estado de notificaciones" on notification_states;
create policy "editar mi estado de notificaciones" on notification_states for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "borrar mi estado de notificaciones" on notification_states;
create policy "borrar mi estado de notificaciones" on notification_states for delete using (user_id = auth.uid());
