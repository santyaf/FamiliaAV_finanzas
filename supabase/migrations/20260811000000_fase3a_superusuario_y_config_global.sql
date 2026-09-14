-- =========================================================
-- FASE 3a — SUPERUSUARIO Y CONFIGURACIÓN GLOBAL
-- =========================================================

create table if not exists platform_admins (
  user_id uuid primary key references profiles(id) on delete cascade,
  granted_by uuid references profiles(id),
  created_at timestamptz default now()
);

create or replace function public.is_platform_admin()
returns boolean as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$ language sql stable security definer;

alter table platform_admins enable row level security;
drop policy if exists "admins ven admins" on platform_admins;
create policy "admins ven admins" on platform_admins for select using (public.is_platform_admin());
drop policy if exists "admins quitan admins" on platform_admins;
create policy "admins quitan admins" on platform_admins for delete using (
  public.is_platform_admin() and user_id <> auth.uid()  -- nadie se auto-elimina por error
);

-- función segura para promover a alguien a superusuario por correo
-- (evita exponer la tabla auth.users al cliente)
create or replace function public.admin_promote_by_email(p_email text)
returns void as $$
declare
  target_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado';
  end if;
  select id into target_id from auth.users where lower(email) = lower(p_email);
  if target_id is null then
    raise exception 'No existe ningún usuario registrado con ese correo';
  end if;
  insert into platform_admins (user_id, granted_by) values (target_id, auth.uid())
  on conflict (user_id) do nothing;
end;
$$ language plpgsql security definer;

-- superusuarios pueden ver metadatos de TODOS los hogares
-- (no el detalle financiero, solo nombre/fecha/miembros)
drop policy if exists "ver mi hogar" on households;
create policy "ver mi hogar" on households for select using (
  public.is_household_member(id) or created_by = auth.uid() or public.is_platform_admin()
);
drop policy if exists "ver miembros de mi hogar" on household_members;
create policy "ver miembros de mi hogar" on household_members for select using (
  public.is_household_member(household_id) or public.is_platform_admin()
);

-- =========================================================
-- CONFIGURACIÓN GLOBAL (feature flags)
-- =========================================================
create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz default now()
);
alter table app_settings enable row level security;

drop policy if exists "leer settings" on app_settings;
create policy "leer settings" on app_settings for select using (auth.role() = 'authenticated');
drop policy if exists "insertar settings" on app_settings;
create policy "insertar settings" on app_settings for insert with check (public.is_platform_admin());
drop policy if exists "actualizar settings" on app_settings;
create policy "actualizar settings" on app_settings for update using (public.is_platform_admin());

insert into app_settings (key, value) values
  ('quick_capture_enabled', 'true'),
  ('ai_provider', '"claude"'),
  ('ai_model', '"claude-sonnet-4-6"'),
  ('signup_open', 'true')
on conflict (key) do nothing;
