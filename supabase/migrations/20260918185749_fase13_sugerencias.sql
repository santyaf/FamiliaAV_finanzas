-- Sugerencias de mejora enviadas por las personas (desde el chat del Asistente),
-- con seguimiento por parte del administrador de la plataforma.

create table if not exists suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,      -- quien sugiere
  household_id uuid references households(id) on delete set null,
  title text not null check (char_length(title) between 3 and 140),
  description text not null check (char_length(description) between 3 and 4000),
  source text not null default 'asistente' check (source in ('asistente', 'manual')),
  status text not null default 'nueva'
    check (status in ('nueva', 'en_revision', 'aprobada', 'en_desarrollo', 'implementada', 'rechazada')),
  admin_note text,                                                      -- respuesta visible para quien sugirió
  reviewed_by uuid references profiles(id),
  admin_notified_at timestamptz,                                        -- cuándo se mandó el push a los admins
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suggestions_status_idx on suggestions (status, created_at desc);
create index if not exists suggestions_user_idx on suggestions (user_id, created_at desc);

-- Historial de seguimiento: cambios de estado y comentarios del administrador.
create table if not exists suggestion_events (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references suggestions(id) on delete cascade,
  actor_id uuid references profiles(id),
  status text,                       -- estado al que pasó (null = solo un comentario)
  note text,
  created_at timestamptz not null default now()
);
create index if not exists suggestion_events_idx on suggestion_events (suggestion_id, created_at);

alter table suggestions enable row level security;
alter table suggestion_events enable row level security;

drop policy if exists "ver mis sugerencias" on suggestions;
create policy "ver mis sugerencias" on suggestions for select
  using (user_id = auth.uid() or is_platform_admin());
drop policy if exists "enviar sugerencia" on suggestions;
create policy "enviar sugerencia" on suggestions for insert
  with check (user_id = auth.uid() and status = 'nueva' and admin_note is null and reviewed_by is null);
drop policy if exists "admin gestiona sugerencias" on suggestions;
create policy "admin gestiona sugerencias" on suggestions for update
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists "ver seguimiento" on suggestion_events;
create policy "ver seguimiento" on suggestion_events for select
  using (exists (select 1 from suggestions s where s.id = suggestion_id));   -- hereda la regla de suggestions
drop policy if exists "admin registra seguimiento" on suggestion_events;
create policy "admin registra seguimiento" on suggestion_events for insert
  with check (is_platform_admin() and actor_id = auth.uid());

-- Aviso dentro de la app (campana) a cada administrador cuando llega una sugerencia.
create or replace function notify_admins_new_suggestion()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into notifications (household_id, user_id, type, title, body, data, dedupe_key)
  select (select hm.household_id from household_members hm where hm.user_id = pa.user_id limit 1),
         pa.user_id, 'suggestion', 'Nueva sugerencia', new.title,
         jsonb_build_object('suggestionId', new.id), 'suggestion:' || new.id || ':' || pa.user_id
  from platform_admins pa
  where pa.user_id <> new.user_id
    and exists (select 1 from household_members hm where hm.user_id = pa.user_id)
  on conflict (household_id, dedupe_key) do nothing;
  return new;
end;
$$;
drop trigger if exists suggestions_notify_admins on suggestions;
create trigger suggestions_notify_admins after insert on suggestions
  for each row execute function notify_admins_new_suggestion();

-- Aviso a quien sugirió cuando el administrador cambia el estado (seguimiento).
create or replace function notify_author_suggestion_status()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  label text;
begin
  if new.status is distinct from old.status and new.status <> 'nueva' then
    label := case new.status
      when 'en_revision' then 'está en revisión'
      when 'aprobada' then 'fue aprobada'
      when 'en_desarrollo' then 'está en desarrollo'
      when 'implementada' then 'ya quedó implementada'
      when 'rechazada' then 'no se va a implementar por ahora'
      else new.status end;
    insert into notifications (household_id, user_id, type, title, body, data, dedupe_key)
    select hm.household_id, new.user_id, 'suggestion_update',
           'Tu sugerencia ' || label,
           new.title || case when new.admin_note is not null and new.admin_note <> '' then ' — ' || new.admin_note else '' end,
           jsonb_build_object('suggestionId', new.id, 'status', new.status),
           'suggestion-status:' || new.id || ':' || new.status
    from household_members hm where hm.user_id = new.user_id
    limit 1
    on conflict (household_id, dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists suggestions_notify_author on suggestions;
create trigger suggestions_notify_author after update on suggestions
  for each row execute function notify_author_suggestion_status();
