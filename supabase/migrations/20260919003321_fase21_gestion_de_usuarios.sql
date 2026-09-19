-- Fase 21: gestión de usuarios (sin borrar datos).
--  - Cada persona puede DESACTIVAR su cuenta (y reactivarla al volver a entrar).
--  - Un administrador de la plataforma puede SUSPENDER y REACTIVAR usuarios y ver su último acceso.
--  - Una cuenta desactivada o suspendida deja de ver datos de hogares: is_household_member() exige
--    status = 'active', así que todas las políticas RLS que dependen de él la dejan afuera.
--  - Los datos NO se borran: los movimientos, cuentas y créditos se conservan tal cual.

alter table profiles
  add column if not exists status text not null default 'active' check (status in ('active', 'deactivated', 'suspended')),
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references profiles(id),
  add column if not exists last_seen_at timestamptz;

create table if not exists user_status_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null,
  changed_by uuid references profiles(id),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists user_status_events_user_idx on user_status_events (user_id, created_at desc);
alter table user_status_events enable row level security;
drop policy if exists "admins ven eventos de usuario" on user_status_events;
create policy "admins ven eventos de usuario" on user_status_events for select using (public.is_platform_admin());

-- Nadie cambia estado / último acceso editando su perfil directo: solo las funciones de abajo.
create or replace function public.guard_profile_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.status is distinct from old.status
    or new.status_changed_at is distinct from old.status_changed_at
    or new.status_changed_by is distinct from old.status_changed_by
    or new.last_seen_at is distinct from old.last_seen_at
  ) then
    raise exception 'El estado de la cuenta solo se cambia desde las funciones de la app';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_status on profiles;
create trigger guard_profile_status before update on profiles for each row execute function public.guard_profile_status();

-- Un hogar solo lo ve quien es integrante Y tiene la cuenta activa.
create or replace function public.is_household_member(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members hm
    join profiles p on p.id = hm.user_id
    where hm.household_id = hid and hm.user_id = auth.uid() and p.status = 'active'
  );
$$ language sql security definer stable set search_path = public;

create or replace function public.deactivate_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set status = 'deactivated', status_changed_at = now(), status_changed_by = auth.uid()
  where id = auth.uid() and status = 'active';
  if not found then raise exception 'La cuenta ya no está activa'; end if;
  insert into user_status_events (user_id, status, changed_by, reason) values (auth.uid(), 'deactivated', auth.uid(), 'Desactivada por la propia persona');
end $$;

create or replace function public.reactivate_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from profiles where id = auth.uid();
  if v_status = 'suspended' then
    raise exception 'Tu cuenta fue suspendida por un administrador de la plataforma. Contáctalo para reactivarla.';
  end if;
  if v_status <> 'deactivated' then raise exception 'La cuenta ya está activa'; end if;
  update profiles set status = 'active', status_changed_at = now(), status_changed_by = auth.uid() where id = auth.uid();
  insert into user_status_events (user_id, status, changed_by, reason) values (auth.uid(), 'active', auth.uid(), 'Reactivada por la propia persona');
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo un administrador de la plataforma puede hacer esto'; end if;
  if p_user = auth.uid() then raise exception 'No puedes cambiar el estado de tu propia cuenta desde aquí'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'Estado no válido'; end if;
  update profiles set status = p_status, status_changed_at = now(), status_changed_by = auth.uid() where id = p_user;
  if not found then raise exception 'No existe ese usuario'; end if;
  insert into user_status_events (user_id, status, changed_by, reason) values (p_user, p_status, auth.uid(), p_reason);
end $$;

create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = public as $$
  update profiles set last_seen_at = now()
  where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '30 minutes');
$$;

create or replace function public.admin_list_users()
returns table (user_id uuid, full_name text, email text, status text, last_seen_at timestamptz, created_at timestamptz,
               is_admin boolean, households text, status_changed_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Solo un administrador de la plataforma puede hacer esto'; end if;
  return query
    select p.id, p.full_name, u.email::text, p.status, p.last_seen_at, p.created_at,
           exists (select 1 from platform_admins a where a.user_id = p.id),
           (select string_agg(h.name, ', ' order by h.name) from household_members hm join households h on h.id = hm.household_id where hm.user_id = p.id),
           p.status_changed_at
    from profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end $$;

revoke all on function public.deactivate_my_account() from public, anon;
revoke all on function public.reactivate_my_account() from public, anon;
revoke all on function public.admin_set_user_status(uuid, text, text) from public, anon;
revoke all on function public.touch_last_seen() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.deactivate_my_account() to authenticated;
grant execute on function public.reactivate_my_account() to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
