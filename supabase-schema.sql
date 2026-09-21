-- =========================================================
-- FINANZAS DEL HOGAR — esquema completo (idempotente)
-- =========================================================
-- Ejecuta este archivo COMPLETO en Supabase -> SQL Editor.
-- Es seguro correrlo varias veces (create ... if not exists,
-- create or replace, drop ... if exists, add column if not exists).
--
-- Reconstruido desde las migraciones reales del proyecto Supabase
-- (supabase_migrations.schema_migrations):
--   20260908213840_fase_9_notificaciones_push_recordatorios
--   20260909191620_fase_10_documentar_guards_y_search_path
-- =========================================================

-- =========================================================
-- FINANZAS DEL HOGAR — Fase 1: esquema + RLS
-- Ejecutar completo en Supabase → SQL Editor
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- PERFILES ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz default now()
);

-- crea el perfil automáticamente cuando alguien se registra
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- HOGARES ----------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text default 'COP',
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- created_by SIEMPRE se asigna desde la sesión autenticada (nunca desde lo
-- que mande el navegador), para que la política de RLS sea infalible.
create or replace function public.set_created_by()
returns trigger as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists set_households_created_by on households;
create trigger set_households_created_by
  before insert on households
  for each row execute procedure public.set_created_by();

create table if not exists household_members (
  household_id uuid references households(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text check (role in ('admin','member')) default 'member',
  color text default '#2F6E68',
  joined_at timestamptz default now(),
  primary key (household_id, user_id)
);

create table if not exists household_invites (
  token text primary key default encode(gen_random_bytes(9), 'base64'),
  household_id uuid references households(id) on delete cascade,
  created_by uuid references profiles(id),
  expires_at timestamptz default (now() + interval '3 days'),
  max_uses int default 1,
  uses int default 0,
  revoked boolean default false,
  created_at timestamptz default now()
);

-- ---------- CATEGORÍAS ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text check (type in ('income','expense')) not null,
  icon text default '🔖'
);

-- ---------- CUENTAS ----------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  type text check (type in ('individual','shared')) not null,
  owner_ids uuid[] not null default '{}',
  created_at timestamptz default now()
);

-- corrige instalaciones existentes donde la tabla ya se había creado antes
-- de que "payment_kind" se agregara aquí (Fase 12)
alter table accounts add column if not exists payment_kind text
  check (payment_kind in ('efectivo','debito','ahorros','tarjeta_credito','otro'))
  not null default 'otro';

-- ---------- MOVIMIENTOS ----------
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  type text check (type in ('income','expense','settlement')) not null,
  description text,
  amount numeric not null,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  member_id uuid references profiles(id),
  date date not null default current_date,
  recurring boolean default false,
  frequency text,
  is_shared boolean default false,
  participants jsonb,           -- [{member_id, share}]
  settlement_from uuid references profiles(id),
  settlement_to uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  version int default 1,
  edited_by uuid references profiles(id),
  edited_at timestamptz
);

-- corrige instalaciones existentes donde la tabla ya se había creado
-- antes de que "version" se agregara aquí (bug de una fase anterior)
alter table transactions add column if not exists version int default 1;

create table if not exists transaction_history (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  data jsonb not null,
  edited_by uuid references profiles(id),
  edited_at timestamptz default now()
);

-- ---------- OBJETIVOS ----------
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  current_amount numeric default 0,
  target_date date,
  created_at timestamptz default now()
);

create table if not exists goal_votes (
  goal_id uuid references goals(id) on delete cascade,
  member_id uuid references profiles(id) on delete cascade,
  priority int check (priority in (1,2,3)),
  primary key (goal_id, member_id)
);

-- ---------- PRESUPUESTOS ----------
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  category_id uuid references categories(id),
  limit_amount numeric not null,
  scope text not null default 'household', -- 'household' o un member_id (uuid en texto)
  created_at timestamptz default now()
);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table profiles enable row level security;
alter table households enable row level security;
alter table household_members enable row level security;
alter table household_invites enable row level security;
alter table categories enable row level security;
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table transaction_history enable row level security;
alter table goals enable row level security;
alter table goal_votes enable row level security;
alter table budgets enable row level security;

-- función de ayuda: ¿pertenece el usuario actual a este hogar?
create or replace function public.is_household_member(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$ language sql security definer stable;

-- profiles: cualquiera autenticado puede leer perfiles básicos (nombres de sus compañeros de hogar)
-- (la Fase 15 lo restringe más abajo, cuando ya existe is_platform_admin())
drop policy if exists "leer perfiles" on profiles;
create policy "leer perfiles" on profiles for select using (true);
drop policy if exists "editar mi perfil" on profiles;
create policy "editar mi perfil" on profiles for update using (id = auth.uid());

-- households
drop policy if exists "ver mi hogar" on households;
create policy "ver mi hogar" on households for select
  using (public.is_household_member(id) or created_by = auth.uid());
drop policy if exists "crear hogar" on households;
create policy "crear hogar" on households for insert
  with check (auth.uid() is not null);
drop policy if exists "admin edita hogar" on households;
create policy "admin edita hogar" on households for update
  using (exists (select 1 from household_members where household_id = id and user_id = auth.uid() and role = 'admin'));

-- household_members
drop policy if exists "ver miembros de mi hogar" on household_members;
create policy "ver miembros de mi hogar" on household_members for select
  using (public.is_household_member(household_id));
-- Solo quien crea el hogar puede auto-insertarse (como admin). Cualquier otra
-- persona debe entrar exclusivamente vía la función redeem_invite() de abajo,
-- para que unirse a un hogar SIEMPRE requiera una invitación válida.
drop policy if exists "creador se une como admin" on household_members;
create policy "creador se une como admin" on household_members for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from households h where h.id = household_id and h.created_by = auth.uid())
  );
drop policy if exists "salir o admin gestiona" on household_members;
create policy "salir o admin gestiona" on household_members for delete
  using (user_id = auth.uid() or exists (
    select 1 from household_members hm where hm.household_id = household_members.household_id and hm.user_id = auth.uid() and hm.role = 'admin'));

-- household_invites
drop policy if exists "ver invitaciones de mi hogar" on household_invites;
create policy "ver invitaciones de mi hogar" on household_invites for select
  using (public.is_household_member(household_id));
drop policy if exists "crear invitacion" on household_invites;
create policy "crear invitacion" on household_invites for insert
  with check (public.is_household_member(household_id));
-- Nota: NO se crea policy de UPDATE para household_invites. El canje de
-- invitaciones se hace exclusivamente a través de la función redeem_invite()
-- de abajo (security definer), para no exponer un update abierto en RLS.

-- función segura para canjear una invitación (evita condiciones de carrera y
-- no permite a un usuario cualquiera actualizar uses/revoked directamente)
create or replace function public.redeem_invite(p_token text)
returns uuid as $$
declare
  inv household_invites%rowtype;
begin
  select * into inv from household_invites where token = p_token for update;

  if inv.token is null then
    raise exception 'Invitación no encontrada';
  end if;
  if inv.revoked then
    raise exception 'Esta invitación fue revocada';
  end if;
  if inv.uses >= inv.max_uses then
    raise exception 'Esta invitación ya fue usada';
  end if;
  if inv.expires_at < now() then
    raise exception 'Esta invitación venció';
  end if;
  if exists (select 1 from household_members where household_id = inv.household_id and user_id = auth.uid()) then
    raise exception 'Ya perteneces a este hogar';
  end if;

  insert into household_members (household_id, user_id, role, color)
  values (
    inv.household_id, auth.uid(), 'member',
    (array['#2F6E68','#E0673F','#5B7FA6','#B98A22','#8E5B9F','#4A9B6E','#B5533C','#3D6B8C'])[floor(random()*8+1)]
  );

  update household_invites set uses = uses + 1 where token = p_token;

  return inv.household_id;
end;
$$ language plpgsql security definer;

-- tablas de datos del hogar: mismo patrón para todas
drop policy if exists "ver categorias" on categories;
create policy "ver categorias" on categories for select using (public.is_household_member(household_id));
drop policy if exists "escribir categorias" on categories;
create policy "escribir categorias" on categories for insert with check (public.is_household_member(household_id));
drop policy if exists "borrar categorias" on categories;
create policy "borrar categorias" on categories for delete using (public.is_household_member(household_id));

-- Función que decide si el usuario puede ver una cuenta:
-- compartida -> todo el hogar; individual -> solo su dueño
drop policy if exists "ver cuentas" on accounts;
create policy "ver cuentas" on accounts for select using (
  public.is_household_member(household_id)
  and (type = 'shared' or auth.uid() = any(owner_ids))
);
drop policy if exists "escribir cuentas" on accounts;
create policy "escribir cuentas" on accounts for insert with check (public.is_household_member(household_id));
drop policy if exists "borrar cuentas" on accounts;
create policy "borrar cuentas" on accounts for delete using (public.is_household_member(household_id));
drop policy if exists "actualizar cuentas" on accounts;
create policy "actualizar cuentas" on accounts for update
  using (public.is_household_member(household_id) and (type = 'shared' or auth.uid() = any(owner_ids)))
  with check (public.is_household_member(household_id));

-- Función que decide si el usuario puede ver un MOVIMIENTO:
-- - conciliación (settlement): solo las dos personas involucradas
-- - gasto/ingreso compartido (is_shared): quien pagó + cada participante
-- - individual: solo el integrante dueño, o si la cuenta es compartida, todo el hogar
create or replace function public.can_see_transaction(
  p_type text, p_is_shared boolean, p_member_id uuid, p_account_id uuid,
  p_participants jsonb, p_settlement_from uuid, p_settlement_to uuid
) returns boolean as $$
  select case
    when p_type = 'settlement' then (p_settlement_from = auth.uid() or p_settlement_to = auth.uid())
    when p_is_shared and p_participants is not null then (
      p_member_id = auth.uid()
      or exists (select 1 from jsonb_array_elements(p_participants) el where (el->>'memberId')::uuid = auth.uid())
    )
    else (
      p_member_id = auth.uid()
      or exists (select 1 from accounts a where a.id = p_account_id and a.type = 'shared')
    )
  end;
$$ language sql stable security definer;

drop policy if exists "ver movimientos" on transactions;
create policy "ver movimientos" on transactions for select using (
  public.is_household_member(household_id)
  and public.can_see_transaction(type, is_shared, member_id, account_id, participants, settlement_from, settlement_to)
);
drop policy if exists "crear movimientos" on transactions;
create policy "crear movimientos" on transactions for insert with check (
  public.is_household_member(household_id)
  and created_by = auth.uid()
  and (account_id is null or exists (select 1 from accounts a where a.id = account_id))
);
drop policy if exists "editar movimientos" on transactions;
create policy "editar movimientos" on transactions for update using (public.is_household_member(household_id));
drop policy if exists "borrar movimientos" on transactions;
create policy "borrar movimientos" on transactions for delete using (public.is_household_member(household_id));

drop policy if exists "ver historial" on transaction_history;
create policy "ver historial" on transaction_history for select using (
  exists (select 1 from transactions t where t.id = transaction_id and public.is_household_member(t.household_id))
);
drop policy if exists "crear historial" on transaction_history;
create policy "crear historial" on transaction_history for insert with check (
  exists (select 1 from transactions t where t.id = transaction_id and public.is_household_member(t.household_id))
);

drop policy if exists "ver objetivos" on goals;
create policy "ver objetivos" on goals for select using (public.is_household_member(household_id));
drop policy if exists "escribir objetivos" on goals;
create policy "escribir objetivos" on goals for insert with check (public.is_household_member(household_id));
drop policy if exists "actualizar objetivos" on goals;
create policy "actualizar objetivos" on goals for update using (public.is_household_member(household_id));
drop policy if exists "borrar objetivos" on goals;
create policy "borrar objetivos" on goals for delete using (public.is_household_member(household_id));

drop policy if exists "ver votos" on goal_votes;
create policy "ver votos" on goal_votes for select using (
  exists (select 1 from goals g where g.id = goal_id and public.is_household_member(g.household_id))
);
drop policy if exists "votar" on goal_votes;
create policy "votar" on goal_votes for insert with check (member_id = auth.uid());
drop policy if exists "cambiar mi voto" on goal_votes;
create policy "cambiar mi voto" on goal_votes for update using (member_id = auth.uid());

drop policy if exists "ver presupuestos" on budgets;
create policy "ver presupuestos" on budgets for select using (
  public.is_household_member(household_id) and (scope = 'household' or scope = auth.uid()::text)
);
drop policy if exists "escribir presupuestos" on budgets;
create policy "escribir presupuestos" on budgets for insert with check (public.is_household_member(household_id));
drop policy if exists "borrar presupuestos" on budgets;
create policy "borrar presupuestos" on budgets for delete using (public.is_household_member(household_id));

-- =========================================================
-- FASE 3 — MÓDULO DE CRÉDITOS
-- =========================================================

create table if not exists credits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  credit_type text default 'otro',
  currency text check (currency in ('COP','UVR')) not null default 'COP',
  principal numeric not null,
  annual_rate numeric not null,             -- tasa efectiva anual (E.A.), en % (ej. 24.5)
  term_months int not null,
  amortization_system text check (amortization_system in ('frances','aleman')) not null default 'frances',
  insurance_monthly numeric not null default 0,
  owner_member_id uuid references profiles(id),   -- null = compartido por todo el hogar
  account_id uuid references accounts(id),
  start_date date not null default current_date,
  status text check (status in ('activo','pagado')) not null default 'activo',
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists credit_payments (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid references credits(id) on delete cascade,
  installment_number int not null,
  due_date date not null,
  capital numeric not null,
  interest numeric not null,
  insurance numeric not null default 0,
  total numeric not null,
  balance_after numeric not null,
  paid boolean not null default false,
  paid_date date,
  transaction_id uuid references transactions(id)
);

create table if not exists credit_extra_payments (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid references credits(id) on delete cascade,
  amount numeric not null,
  strategy text check (strategy in ('reducir_plazo','reducir_cuota')) not null,
  applied_date date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists uvr_rates (
  date date primary key,
  value numeric not null
);

alter table credits enable row level security;
alter table credit_payments enable row level security;
alter table credit_extra_payments enable row level security;
alter table uvr_rates enable row level security;

-- créditos: si es individual (owner_member_id no nulo), solo su dueño lo ve
drop policy if exists "ver creditos" on credits;
create policy "ver creditos" on credits for select using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);
drop policy if exists "crear creditos" on credits;
create policy "crear creditos" on credits for insert with check (public.is_household_member(household_id));
drop policy if exists "editar creditos" on credits;
create policy "editar creditos" on credits for update using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);
drop policy if exists "borrar creditos" on credits;
create policy "borrar creditos" on credits for delete using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);

drop policy if exists "ver cuotas" on credit_payments;
create policy "ver cuotas" on credit_payments for select using (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);
drop policy if exists "insertar cuotas" on credit_payments;
create policy "insertar cuotas" on credit_payments for insert with check (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);
drop policy if exists "actualizar cuotas" on credit_payments;
create policy "actualizar cuotas" on credit_payments for update using (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);
drop policy if exists "borrar cuotas" on credit_payments;
create policy "borrar cuotas" on credit_payments for delete using (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);

drop policy if exists "ver abonos" on credit_extra_payments;
create policy "ver abonos" on credit_extra_payments for select using (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);
drop policy if exists "crear abonos" on credit_extra_payments;
create policy "crear abonos" on credit_extra_payments for insert with check (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);

-- uvr_rates: catálogo global (no es dato de un hogar), cualquier usuario autenticado puede leer/cachear
drop policy if exists "leer uvr" on uvr_rates;
create policy "leer uvr" on uvr_rates for select using (auth.role() = 'authenticated');
drop policy if exists "escribir uvr" on uvr_rates;
create policy "escribir uvr" on uvr_rates for insert with check (auth.role() = 'authenticated');
drop policy if exists "actualizar uvr" on uvr_rates;
create policy "actualizar uvr" on uvr_rates for update using (auth.role() = 'authenticated');

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

-- profiles: el propio, el de quienes comparten hogar contigo, y los admins de plataforma (Fase 15)
create or replace function public.shares_household_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members a
    join household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;
drop policy if exists "leer perfiles" on profiles;
create policy "leer perfiles" on profiles for select
  using (id = auth.uid() or public.shares_household_with(id) or public.is_platform_admin());

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

-- =========================================================
-- FASE 4 — OBJETIVOS COMO "BOLSILLO" + APROBACIÓN FAMILIAR
-- =========================================================

-- "transfer": mover dinero de una cuenta hacia/desde el "bolsillo" de un objetivo.
-- No cuenta como ingreso/gasto en los reportes (por eso es un tipo aparte).
alter table transactions drop constraint if exists transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('income','expense','settlement','transfer'));
alter table transactions add column if not exists goal_id uuid references goals(id);
alter table transactions add column if not exists transfer_direction text check (transfer_direction in ('deposit','withdraw'));

-- objetivos individuales (solo su dueño los ve/controla) vs familiares (null = de todo el hogar)
alter table goals add column if not exists owner_member_id uuid references profiles(id);

drop policy if exists "ver objetivos" on goals;
create policy "ver objetivos" on goals for select using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);
drop policy if exists "actualizar objetivos" on goals;
create policy "actualizar objetivos" on goals for update using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);
drop policy if exists "borrar objetivos" on goals;
create policy "borrar objetivos" on goals for delete using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);

-- solicitudes de cambio (editar meta o retirar dinero) — para objetivos FAMILIARES
-- requieren aprobación UNÁNIME de todos los integrantes del hogar antes de aplicarse.
-- Para objetivos INDIVIDUALES el cambio se aplica directo (sin pasar por aquí).
create table if not exists goal_change_requests (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  requested_by uuid references profiles(id),
  change_type text check (change_type in ('edit_target','withdraw')) not null,
  new_target_amount numeric,
  new_target_date date,
  withdraw_amount numeric,
  withdraw_account_id uuid references accounts(id),
  withdraw_member_id uuid references profiles(id),
  status text check (status in ('pending','approved','rejected')) not null default 'pending',
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists goal_change_votes (
  request_id uuid references goal_change_requests(id) on delete cascade,
  member_id uuid references profiles(id),
  approve boolean not null,
  voted_at timestamptz default now(),
  primary key (request_id, member_id)
);

alter table goal_change_requests enable row level security;
alter table goal_change_votes enable row level security;

drop policy if exists "ver solicitudes" on goal_change_requests;
create policy "ver solicitudes" on goal_change_requests for select using (public.is_household_member(household_id));
drop policy if exists "crear solicitudes" on goal_change_requests;
create policy "crear solicitudes" on goal_change_requests for insert with check (public.is_household_member(household_id));
drop policy if exists "resolver solicitudes" on goal_change_requests;
create policy "resolver solicitudes" on goal_change_requests for update using (public.is_household_member(household_id));

drop policy if exists "ver votos" on goal_change_votes;
create policy "ver votos" on goal_change_votes for select using (
  exists (select 1 from goal_change_requests r where r.id = request_id and public.is_household_member(r.household_id))
);
drop policy if exists "votar solicitud" on goal_change_votes;
create policy "votar solicitud" on goal_change_votes for insert with check (member_id = auth.uid());

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

-- =========================================================
-- FASE 5 — arreglos y funciones nuevas
-- =========================================================

-- BUG: borrar una cuenta con movimientos o créditos asociados fallaba en
-- silencio (violación de llave foránea, sin ON DELETE). Se deja el registro
-- histórico intacto pero sin cuenta asociada, tal como ya decía el mensaje
-- de confirmación en la app ("los movimientos no se borrarán").
alter table transactions drop constraint if exists transactions_account_id_fkey;
alter table transactions add constraint transactions_account_id_fkey
  foreign key (account_id) references accounts(id) on delete set null;

alter table credits drop constraint if exists credits_account_id_fkey;
alter table credits add constraint credits_account_id_fkey
  foreign key (account_id) references accounts(id) on delete set null;

-- Transferencias de dinero ENTRE INTEGRANTES (no ligadas a un objetivo) —
-- se ven en Movimientos, no afectan el cálculo de "quién debe a quién" de
-- gastos compartidos (eso sigue siendo settlement).
alter table transactions add column if not exists to_member_id uuid references profiles(id);
alter table transactions add column if not exists to_account_id uuid references accounts(id);

-- Seguros de crédito con vigencia (pueden cambiar de valor cada renovación,
-- y "endosarse" simplemente agregando una nueva vigencia o desactivando la actual).
create table if not exists credit_insurances (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid references credits(id) on delete cascade,
  insurance_type text check (insurance_type in ('vida','incendio_terremoto','desempleo','otro')) not null,
  monthly_value numeric not null,
  valid_from date not null,
  valid_to date not null,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table credit_insurances enable row level security;
drop policy if exists "ver seguros" on credit_insurances;
create policy "ver seguros" on credit_insurances for select using (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);
drop policy if exists "insertar seguros" on credit_insurances;
create policy "insertar seguros" on credit_insurances for insert with check (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);
drop policy if exists "actualizar seguros" on credit_insurances;
create policy "actualizar seguros" on credit_insurances for update using (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);
drop policy if exists "borrar seguros" on credit_insurances;
create policy "borrar seguros" on credit_insurances for delete using (
  exists (select 1 from credits c where c.id = credit_id
    and public.is_household_member(c.household_id) and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);

-- =========================================================
-- FASE 6 — quien RECIBE una transferencia entre integrantes también debe verla
-- =========================================================
-- Bug: can_see_transaction() no consideraba to_member_id, así que solo quien
-- ENVIABA una transferencia entre integrantes podía verla en Movimientos.
-- (la política "ver movimientos" depende de la función, así que hay que
-- borrar primero la política antes de poder borrar la función)
drop policy if exists "ver movimientos" on transactions;
drop function if exists public.can_see_transaction(text, boolean, uuid, uuid, jsonb, uuid, uuid);

create or replace function public.can_see_transaction(
  p_type text, p_is_shared boolean, p_member_id uuid, p_account_id uuid,
  p_participants jsonb, p_settlement_from uuid, p_settlement_to uuid,
  p_to_member_id uuid, p_goal_id uuid
) returns boolean as $$
  select case
    when p_type = 'settlement' then (p_settlement_from = auth.uid() or p_settlement_to = auth.uid())
    when p_type = 'transfer' and p_goal_id is null then (p_member_id = auth.uid() or p_to_member_id = auth.uid())
    when p_is_shared and p_participants is not null then (
      p_member_id = auth.uid()
      or exists (select 1 from jsonb_array_elements(p_participants) el where (el->>'memberId')::uuid = auth.uid())
    )
    else (
      p_member_id = auth.uid()
      or exists (select 1 from accounts a where a.id = p_account_id and a.type = 'shared')
    )
  end;
$$ language sql stable security definer;

create policy "ver movimientos" on transactions for select using (
  public.is_household_member(household_id)
  and public.can_see_transaction(type, is_shared, member_id, account_id, participants, settlement_from, settlement_to, to_member_id, goal_id)
);

-- =========================================================
-- FASE 7 — transferencia entre integrantes: saldar deuda es opcional
-- =========================================================
alter table transactions add column if not exists settles_debt boolean not null default false;

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


-- =========================================================
-- FASE 10 — guardas a nivel de base de datos + endurecimiento
-- =========================================================
-- Documenta funciones/triggers que ya existían en la base real (agregados
-- por fuera de este archivo) + endurecimiento de seguridad: search_path
-- fijo en las funciones SECURITY DEFINER ("Function Search Path Mutable").
-- =========================================================

-- Estas dos funciones + triggers son una segunda capa de protección (a nivel
-- de base de datos, no solo en la app) para que un objetivo FAMILIAR nunca
-- pueda editarse ni recibir un retiro sin pasar por vote_and_resolve_goal_request().
create or replace function public.guard_family_goal_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if current_setting('app.bypass_goal_guard', true) = 'true' then
    return new; -- solo lo activa vote_and_resolve_goal_request()
  end if;
  if old.owner_member_id is null then
    if new.target_amount is distinct from old.target_amount or new.target_date is distinct from old.target_date then
      raise exception 'Editar la meta de un objetivo familiar requiere aprobación unánime del hogar.';
    end if;
    if new.current_amount < old.current_amount then
      raise exception 'Retirar saldo de un objetivo familiar requiere aprobación unánime del hogar.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_family_goal_changes on goals;
create trigger guard_family_goal_changes before update on public.goals
  for each row execute function guard_family_goal_changes();

create or replace function public.guard_family_goal_withdraw_tx()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  is_family boolean;
begin
  if current_setting('app.bypass_goal_guard', true) = 'true' then
    return new;
  end if;
  if new.type = 'transfer' and new.transfer_direction = 'withdraw' and new.goal_id is not null then
    select (owner_member_id is null) into is_family from goals where id = new.goal_id;
    if is_family then
      raise exception 'Retirar saldo de un objetivo familiar requiere aprobación unánime del hogar.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_family_goal_withdraw_tx on transactions;
create trigger guard_family_goal_withdraw_tx before insert on public.transactions
  for each row execute function guard_family_goal_withdraw_tx();

-- Vota y, si con ese voto se llega a unanimidad, aplica el cambio en la misma
-- transacción (evita condiciones de carrera del enfoque anterior de "votar y
-- luego revisar si ya se puede aplicar" desde el cliente en dos pasos separados).
-- Es la ÚNICA forma de que un cambio a un objetivo familiar realmente se aplique
-- (activa app.bypass_goal_guard solo dentro de su propia transacción).
create or replace function public.vote_and_resolve_goal_request(p_request_id uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  req goal_change_requests%rowtype;
  member_count int;
  approved_count int;
  any_rejected boolean;
begin
  select * into req from goal_change_requests where id = p_request_id for update;
  if req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;
  if not public.is_household_member(req.household_id) then
    raise exception 'No autorizado';
  end if;
  if req.status <> 'pending' then
    return req.status;
  end if;

  insert into goal_change_votes (request_id, member_id, approve)
  values (p_request_id, auth.uid(), p_approve)
  on conflict (request_id, member_id) do update set approve = excluded.approve, voted_at = now();

  select count(*) into member_count from household_members where household_id = req.household_id;

  select count(*) filter (where v.approve = true) into approved_count
  from goal_change_votes v
  join household_members hm on hm.user_id = v.member_id and hm.household_id = req.household_id
  where v.request_id = p_request_id;

  select exists (
    select 1
    from goal_change_votes v
    join household_members hm on hm.user_id = v.member_id and hm.household_id = req.household_id
    where v.request_id = p_request_id and v.approve = false
  ) into any_rejected;

  if any_rejected then
    update goal_change_requests set status = 'rejected', resolved_at = now() where id = p_request_id;
    return 'rejected';
  end if;

  if approved_count >= member_count then
    perform set_config('app.bypass_goal_guard', 'true', true); -- true = solo esta transacción

    if req.change_type = 'edit_target' then
      update goals set target_amount = req.new_target_amount, target_date = req.new_target_date
      where id = req.goal_id;
    elsif req.change_type = 'withdraw' then
      insert into transactions (
        household_id, type, description, amount, account_id, member_id,
        goal_id, transfer_direction, date, created_by
      ) values (
        req.household_id, 'transfer', 'Retiro aprobado de objetivo familiar', req.withdraw_amount,
        req.withdraw_account_id, req.withdraw_member_id, req.goal_id, 'withdraw', current_date, req.requested_by
      );
      update goals set current_amount = greatest(0, current_amount - req.withdraw_amount) where id = req.goal_id;
    end if;

    update goal_change_requests set status = 'approved', resolved_at = now() where id = p_request_id;
    return 'approved';
  end if;

  return 'pending';
end;
$function$;

-- Event trigger de mantenimiento: activa RLS automáticamente en cualquier
-- tabla nueva que se cree en public (red de seguridad extra por si algún día
-- se agrega una tabla y alguien olvida el "alter table ... enable row level security").
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function rls_auto_enable();

-- Endurecimiento: fija search_path en todas las funciones SECURITY DEFINER
-- (alerta "Function Search Path Mutable" del linter de seguridad de Supabase).
alter function public.handle_new_user() set search_path = public;
alter function public.is_household_member(uuid) set search_path = public;
alter function public.redeem_invite(text) set search_path = public;
alter function public.set_created_by() set search_path = public;
alter function public.is_platform_admin() set search_path = public;
alter function public.admin_promote_by_email(text) set search_path = public;
alter function public.can_see_transaction(text, boolean, uuid, uuid, jsonb, uuid, uuid, uuid, uuid) set search_path = public;

-- =========================================================
-- FASE 12 — OBLIGACIONES (recordatorios de pagos recurrentes)
-- =========================================================
-- Recordatorios push de pagos que no se deben olvidar (arriendo, servicios,
-- suscripciones...), por integrante o de todo el hogar, con monto opcional
-- (vacío = variable, ej. servicios públicos). El recordatorio, al tocarlo,
-- abre la app lista para registrar ese gasto.

create table if not exists obligations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  owner_member_id uuid references profiles(id),   -- null = obligación del hogar
  name text not null,
  amount numeric,                                   -- null = monto variable cada vez
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  frequency text check (frequency in ('semanal','quincenal','mensual','anual')) not null default 'mensual',
  next_due_date date not null,
  time_of_day text not null default '09:00',
  timezone text not null default 'America/Bogota',
  note text,
  enabled boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
alter table obligations enable row level security;

drop policy if exists "ver obligaciones" on obligations;
create policy "ver obligaciones" on obligations for select using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);
drop policy if exists "crear obligaciones" on obligations;
create policy "crear obligaciones" on obligations for insert with check (public.is_household_member(household_id));
drop policy if exists "editar obligaciones" on obligations;
create policy "editar obligaciones" on obligations for update using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);
drop policy if exists "borrar obligaciones" on obligations;
create policy "borrar obligaciones" on obligations for delete using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);

-- evita reenviar el mismo recordatorio dos veces el mismo día (mismo patrón
-- que reminder_sent_log de la Fase 9)
create table if not exists obligation_sent_log (
  obligation_id uuid references obligations(id) on delete cascade,
  sent_date date not null,
  sent_at timestamptz default now(),
  primary key (obligation_id, sent_date)
);
alter table obligation_sent_log enable row level security;
-- la escribe únicamente la función serverless con la service role key
-- (que salta RLS por diseño); no necesita políticas para el cliente.

-- =========================================================
-- FASE 12 — MEDIO DE PAGO POR TRANSACCIÓN
-- =========================================================
-- El medio de pago de una cuenta es solo un valor por defecto: cada
-- transacción puede anularlo (ej. efectivo sacado de una cuenta de
-- ahorros). NULL = usa el medio de pago de la cuenta.
alter table transactions
  add column if not exists payment_kind text
  check (payment_kind in ('efectivo','debito','ahorros','tarjeta_credito','otro'));

-- =========================================================
-- FASE 13 — CONTROL DE ACCESO POR FUNCIÓN DE IA
-- =========================================================
-- Cada función de IA (Registro rápido, Asistente financiero) puede estar
-- activada para todos ('all'), para nadie ('none'), o para una lista
-- específica de personas ('selected' + userIds). Reemplaza el booleano
-- quick_capture_enabled (se deja la fila vieja sin usar, sin borrarla).
insert into app_settings (key, value) values
  ('quick_capture_access', '{"mode":"all","userIds":[]}'::jsonb),
  ('assistant_access', '{"mode":"none","userIds":[]}'::jsonb)
on conflict (key) do nothing;

-- =========================================================
-- Fase 13: sugerencias de mejora con seguimiento del administrador
-- =========================================================
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

-- =========================================================
-- Fase 17: naturaleza contable (base de los estados financieros)
-- =========================================================
-- Fase 17: base para los estados financieros (Resultados, Flujo de efectivo).
-- Cada categoría trae un rubro y una naturaleza contable; un movimiento puede
-- anular esa naturaleza. Así el saldo inicial de una cuenta, un préstamo
-- recibido o el capital de una deuda no se mezclan con ingresos/gastos operativos.

alter table categories
  add column if not exists group_name text,
  add column if not exists nature text not null default 'operativo'
    check (nature in ('operativo', 'financiamiento', 'inversion')),
  add column if not exists is_fixed boolean not null default false;

alter table transactions
  add column if not exists nature text
    check (nature in ('operativo', 'financiamiento', 'inversion', 'apertura'));   -- null = la de su categoría

-- Cuota de crédito pagada = 2 movimientos: capital (financiamiento) + intereses/seguro (gasto).
-- transaction_id sigue apuntando al de capital; este apunta al de intereses/seguro.
alter table credit_payments
  add column if not exists interest_transaction_id uuid references transactions(id) on delete set null;

-- Editar categorías: nunca existió la política de UPDATE (mismo hueco que tenía accounts).
drop policy if exists "actualizar categorias" on categories;
create policy "actualizar categorias" on categories for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Clasificación de las categorías por defecto que ya existen en los hogares.
update categories set group_name = 'Ingresos laborales' where name in ('Salario', 'Negocio / Freelance') and type = 'income';
update categories set group_name = 'Ingresos por activos' where name in ('Rentas', 'Inversiones') and type = 'income';
update categories set group_name = 'Otros ingresos' where name = 'Otros ingresos' and type = 'income';
update categories set group_name = 'Vivienda y servicios', is_fixed = true where name = 'Vivienda' and type = 'expense';
update categories set group_name = 'Vivienda y servicios' where name = 'Servicios (luz/agua/internet)' and type = 'expense';
update categories set group_name = 'Alimentación' where name = 'Alimentación' and type = 'expense';
update categories set group_name = 'Transporte' where name = 'Transporte' and type = 'expense';
update categories set group_name = 'Salud' where name = 'Salud' and type = 'expense';
update categories set group_name = 'Educación', is_fixed = true where name = 'Educación' and type = 'expense';
update categories set group_name = 'Estilo de vida' where name in ('Ocio y entretenimiento', 'Ropa') and type = 'expense';
update categories set group_name = 'Otros' where name = 'Otros gastos' and type = 'expense';
update categories set group_name = 'Deudas', nature = 'financiamiento', is_fixed = true where name = 'Deudas y préstamos' and type = 'expense';
update categories set group_name = 'Ahorro e inversión', nature = 'inversion' where name = 'Ahorro / Inversión' and type = 'expense';

-- Categorías nuevas para todos los hogares: intereses (gasto) y préstamos recibidos (ingreso por financiamiento).
insert into categories (household_id, name, type, icon, group_name, nature, is_fixed)
select h.id, 'Intereses y comisiones', 'expense', 'credit-card', 'Costos financieros', 'operativo', false
from households h
where not exists (select 1 from categories c where c.household_id = h.id and c.name = 'Intereses y comisiones' and c.type = 'expense');
insert into categories (household_id, name, type, icon, group_name, nature, is_fixed)
select h.id, 'Préstamos recibidos', 'income', 'plus', 'Financiamiento', 'financiamiento', false
from households h
where not exists (select 1 from categories c where c.household_id = h.id and c.name = 'Préstamos recibidos' and c.type = 'income');

-- Los saldos iniciales de cuentas se guardaron como ingresos: son apertura, no ingreso del período.
update transactions set nature = 'apertura' where type = 'income' and description = 'Saldo inicial' and nature is null;

-- =========================================================
-- Fase 18: créditos — libranza, historial de eventos y UVR al pagar
-- =========================================================
-- Fase 18: revisión de créditos.
--  - Libranza: la cuota se descuenta de la nómina (payment_source = 'libranza').
--  - Historial de eventos del crédito: retanqueos, rediferidos, abonos, pagos revertidos.
--  - Valor de la UVR usado al pagar una cuota de un crédito en UVR (para convertir a pesos).

alter table credits
  add column if not exists payment_source text not null default 'cuenta'
    check (payment_source in ('cuenta', 'libranza')),
  add column if not exists payroll_employer text,
  add column if not exists payroll_day int check (payroll_day between 1 and 31),
  add column if not exists auto_register boolean not null default false;   -- registrar solo el descuento al vencer (libranza)

alter table credit_payments
  add column if not exists paid_uvr_value numeric;

create table if not exists credit_events (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references credits(id) on delete cascade,
  kind text not null check (kind in ('creacion', 'abono', 'retanqueo', 'rediferido', 'cambio_condiciones', 'pago_revertido')),
  event_date date not null default current_date,
  amount numeric,                                   -- dinero nuevo (retanqueo) o monto del abono
  balance_before numeric, balance_after numeric,
  rate_before numeric, rate_after numeric,          -- E.A. %
  term_before int, term_after int,                  -- cuotas que faltaban antes / después
  installment_before numeric, installment_after numeric,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists credit_events_credit_idx on credit_events (credit_id, event_date, created_at);
alter table credit_events enable row level security;

-- Mismas reglas que el resto del crédito: solo quien ve el crédito (compartido o suyo).
drop policy if exists "ver eventos de credito" on credit_events;
create policy "ver eventos de credito" on credit_events for select using (
  exists (select 1 from credits c where c.id = credit_events.credit_id and is_household_member(c.household_id)
          and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);
drop policy if exists "crear eventos de credito" on credit_events;
create policy "crear eventos de credito" on credit_events for insert with check (
  exists (select 1 from credits c where c.id = credit_events.credit_id and is_household_member(c.household_id)
          and (c.owner_member_id is null or c.owner_member_id = auth.uid()))
);

-- =========================================================
-- ---------- FASE 19: TARJETAS DE CRÉDITO ----------
-- Fase 19: tarjetas de crédito.
--  - La cuenta de una tarjeta guarda su cupo, día de corte, día límite de pago y la tasa
--    típica de sus compras diferidas.
--  - Una compra diferida a N cuotas crea un "plan" (card_plans): cada corte se factura una
--    cuota; su interés se registra como gasto en la tarjeta. Rediferir cambia cuotas / tasa.
--  - card_plan_events guarda el historial del plan (compra, cobros, rediferidos, abonos).

alter table accounts
  add column if not exists credit_limit numeric check (credit_limit >= 0),
  add column if not exists statement_day int check (statement_day between 1 and 31),
  add column if not exists payment_day int check (payment_day between 1 and 31),
  add column if not exists card_rate numeric check (card_rate >= 0);   -- E.A. %

create table if not exists card_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete cascade,   -- la compra
  member_id uuid references profiles(id),
  description text not null,
  principal numeric not null check (principal > 0),      -- capital diferido vigente (cambia al rediferir)
  annual_rate numeric not null default 0 check (annual_rate >= 0),     -- E.A. %
  installments int not null check (installments between 1 and 120),
  first_bill_date date not null,                          -- corte en que se factura la 1.ª cuota
  billed_count int not null default 0 check (billed_count >= 0),
  status text not null default 'activo' check (status in ('activo', 'pagado')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists card_plans_transaction_uidx on card_plans (transaction_id) where transaction_id is not null;
create index if not exists card_plans_account_idx on card_plans (account_id);
alter table card_plans enable row level security;

-- Un plan lo ve quien ve la cuenta de la tarjeta (compartida, o individual de su dueño):
-- la subconsulta a accounts ya pasa por la política "ver cuentas".
drop policy if exists "ver planes de tarjeta" on card_plans;
create policy "ver planes de tarjeta" on card_plans for select using (
  public.is_household_member(household_id)
  and exists (select 1 from accounts a where a.id = card_plans.account_id)
);
drop policy if exists "crear planes de tarjeta" on card_plans;
create policy "crear planes de tarjeta" on card_plans for insert with check (
  public.is_household_member(household_id)
  and exists (select 1 from accounts a where a.id = card_plans.account_id and a.household_id = card_plans.household_id)
);
drop policy if exists "editar planes de tarjeta" on card_plans;
create policy "editar planes de tarjeta" on card_plans for update
  using (public.is_household_member(household_id) and exists (select 1 from accounts a where a.id = card_plans.account_id))
  with check (public.is_household_member(household_id));
drop policy if exists "borrar planes de tarjeta" on card_plans;
create policy "borrar planes de tarjeta" on card_plans for delete using (
  public.is_household_member(household_id) and exists (select 1 from accounts a where a.id = card_plans.account_id)
);

create table if not exists card_plan_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references card_plans(id) on delete cascade,
  kind text not null check (kind in ('creacion', 'cobro', 'rediferido', 'abono')),
  event_date date not null default current_date,
  amount numeric,                                   -- interés cobrado / abono
  balance_before numeric, balance_after numeric,    -- capital diferido
  rate_before numeric, rate_after numeric,          -- E.A. %
  term_before int, term_after int,                  -- cuotas que faltaban antes / después
  installment_before numeric, installment_after numeric,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists card_plan_events_plan_idx on card_plan_events (plan_id, event_date, created_at);
alter table card_plan_events enable row level security;
drop policy if exists "ver eventos de plan" on card_plan_events;
create policy "ver eventos de plan" on card_plan_events for select using (
  exists (select 1 from card_plans p where p.id = card_plan_events.plan_id)
);
drop policy if exists "crear eventos de plan" on card_plan_events;
create policy "crear eventos de plan" on card_plan_events for insert with check (
  exists (select 1 from card_plans p where p.id = card_plan_events.plan_id)
);

-- ---------- FASE 19b: TRANSFERENCIAS HACIA/DESDE CUENTAS COMPARTIDAS ----------
-- Fase 19b: una transferencia entre cuentas (ej. pagar una tarjeta compartida desde una
-- cuenta individual) ahora la ve todo el hogar cuando la cuenta de origen o de destino es
-- COMPARTIDA. Antes solo la veían el integrante que la hizo y el destinatario, así que el
-- saldo de una cuenta compartida quedaba distinto para cada integrante.
-- Las transferencias entre cuentas individuales siguen siendo privadas.

create or replace function public.can_see_transaction(
  p_type text, p_is_shared boolean, p_member_id uuid, p_account_id uuid,
  p_participants jsonb, p_settlement_from uuid, p_settlement_to uuid,
  p_to_member_id uuid, p_goal_id uuid, p_to_account_id uuid
) returns boolean as $$
  select case
    when p_type = 'settlement' then (p_settlement_from = auth.uid() or p_settlement_to = auth.uid())
    when p_type = 'transfer' and p_goal_id is null then (
      p_member_id = auth.uid() or p_to_member_id = auth.uid()
      or exists (select 1 from accounts a where a.id in (p_account_id, p_to_account_id) and a.type = 'shared')
    )
    when p_is_shared and p_participants is not null then (
      p_member_id = auth.uid()
      or exists (select 1 from jsonb_array_elements(p_participants) el where (el->>'memberId')::uuid = auth.uid())
    )
    else (
      p_member_id = auth.uid()
      or exists (select 1 from accounts a where a.id = p_account_id and a.type = 'shared')
    )
  end;
$$ language sql stable security definer set search_path = public;

drop policy if exists "ver movimientos" on transactions;
create policy "ver movimientos" on transactions for select using (
  public.is_household_member(household_id)
  and public.can_see_transaction(type, is_shared, member_id, account_id, participants, settlement_from, settlement_to, to_member_id, goal_id, to_account_id)
);

drop function if exists public.can_see_transaction(text, boolean, uuid, uuid, jsonb, uuid, uuid, uuid, uuid);

-- ---------- FASE 20: ESTADO DE NOTIFICACIONES POR PERSONA ----------
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

-- ---------- FASE 21: GESTIÓN DE USUARIOS ----------
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

-- ---------- FASE 22: RECIBOS ADJUNTOS ----------
-- Fase 22: adjuntar el recibo (foto o PDF) a un movimiento.
-- Los archivos van a un bucket PRIVADO de Supabase Storage ("receipts"), en la ruta
--   <household_id>/<transaction_id>/<archivo>
-- y cada archivo tiene una fila en transaction_attachments. Quien puede ver el movimiento
-- (las políticas RLS de transactions ya distinguen lo privado de lo compartido) puede ver y
-- agregar recibos; los archivos solo se leen con URL firmada temporal.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

create table if not exists transaction_attachments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  path text not null unique,
  mime text not null,
  size_bytes int,
  file_name text,
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists transaction_attachments_tx_idx on transaction_attachments (transaction_id);
create index if not exists transaction_attachments_household_idx on transaction_attachments (household_id);
alter table transaction_attachments enable row level security;

-- la subconsulta a transactions ya pasa por "ver movimientos": solo si puedes ver el movimiento
drop policy if exists "ver recibos" on transaction_attachments;
create policy "ver recibos" on transaction_attachments for select using (
  public.is_household_member(household_id)
  and exists (select 1 from transactions t where t.id = transaction_attachments.transaction_id)
);
drop policy if exists "agregar recibos" on transaction_attachments;
create policy "agregar recibos" on transaction_attachments for insert with check (
  public.is_household_member(household_id)
  and created_by = auth.uid()
  and exists (select 1 from transactions t where t.id = transaction_attachments.transaction_id and t.household_id = transaction_attachments.household_id)
);
drop policy if exists "borrar recibos" on transaction_attachments;
create policy "borrar recibos" on transaction_attachments for delete using (
  public.is_household_member(household_id)
  and exists (select 1 from transactions t where t.id = transaction_attachments.transaction_id)
);

-- Archivos: la carpeta es <hogar>/<movimiento>; se lee, sube y borra solo dentro de la carpeta de un
-- movimiento del hogar que puedes ver (la subconsulta a transactions pasa por "ver movimientos").
-- Comparaciones como texto: nada se convierte a uuid. (El "leer" no depende de la fila de
-- transaction_attachments porque al subir el archivo esa fila todavía no existe.)
drop policy if exists "leer recibos" on storage.objects;
create policy "leer recibos" on storage.objects for select to authenticated using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.transactions t
    where t.id::text = (storage.foldername(storage.objects.name))[2]
      and t.household_id::text = (storage.foldername(storage.objects.name))[1]
      and public.is_household_member(t.household_id)
  )
);
drop policy if exists "subir recibos" on storage.objects;
create policy "subir recibos" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.transactions t
    where t.id::text = (storage.foldername(storage.objects.name))[2]
      and t.household_id::text = (storage.foldername(storage.objects.name))[1]
      and public.is_household_member(t.household_id)
  )
);
drop policy if exists "borrar recibos (archivos)" on storage.objects;
create policy "borrar recibos (archivos)" on storage.objects for delete to authenticated using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.transactions t
    where t.id::text = (storage.foldername(storage.objects.name))[2]
      and t.household_id::text = (storage.foldername(storage.objects.name))[1]
      and public.is_household_member(t.household_id)
  )
);

-- ---------- FASE 23: ACTIVOS E INVERSIONES ----------
-- Fase 23: activos e inversiones (para el Estado de Situación Financiera).
--  - assets: propiedades, vehículos, inversiones (CDT, acciones, fondos, cripto), cuentas por cobrar, otros bienes.
--    owner_member_id null = del hogar (lo ven todos); con dueño = solo lo ve esa persona (igual que los créditos).
--  - asset_valuations: historial de valoraciones fechadas; el valor a una fecha sale de la última anterior.
--  - Una inversión con annual_return_rate crece sola (estimado) hasta maturity_date, si no se valoriza a mano.
--  - Al vender, status = 'vendido' con su fecha y monto; el valor pasa a 0 desde esa fecha.

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  owner_member_id uuid references profiles(id),            -- null = del hogar
  name text not null,
  kind text not null check (kind in ('propiedad', 'vehiculo', 'inversion', 'por_cobrar', 'otro')),
  acquired_on date,
  acquisition_cost numeric not null default 0 check (acquisition_cost >= 0),
  credit_id uuid references credits(id) on delete set null,  -- deuda asociada (hipoteca, crédito del carro)
  annual_return_rate numeric check (annual_return_rate >= 0),  -- E.A. % estimada (CDT y similares)
  maturity_date date,
  institution text,
  notes text,
  status text not null default 'activo' check (status in ('activo', 'vendido')),
  sold_on date,
  sold_amount numeric check (sold_amount >= 0),
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists assets_household_idx on assets (household_id);
alter table assets enable row level security;

drop policy if exists "ver activos" on assets;
create policy "ver activos" on assets for select using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);
drop policy if exists "crear activos" on assets;
create policy "crear activos" on assets for insert with check (
  public.is_household_member(household_id) and created_by = auth.uid()
  and (owner_member_id is null or owner_member_id = auth.uid())
);
drop policy if exists "editar activos" on assets;
create policy "editar activos" on assets for update
  using (public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid()))
  with check (public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid()));
drop policy if exists "borrar activos" on assets;
create policy "borrar activos" on assets for delete using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid())
);

create table if not exists asset_valuations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  valued_on date not null,
  value numeric not null check (value >= 0),
  note text,
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists asset_valuations_asset_idx on asset_valuations (asset_id, valued_on);
alter table asset_valuations enable row level security;

-- las valoraciones siguen la visibilidad del activo (la subconsulta pasa por "ver activos")
drop policy if exists "ver valoraciones" on asset_valuations;
create policy "ver valoraciones" on asset_valuations for select using (
  exists (select 1 from assets a where a.id = asset_valuations.asset_id)
);
drop policy if exists "crear valoraciones" on asset_valuations;
create policy "crear valoraciones" on asset_valuations for insert with check (
  created_by = auth.uid() and exists (select 1 from assets a where a.id = asset_valuations.asset_id)
);
drop policy if exists "borrar valoraciones" on asset_valuations;
create policy "borrar valoraciones" on asset_valuations for delete using (
  exists (select 1 from assets a where a.id = asset_valuations.asset_id)
);

-- ---------- FASE 24: PLANTILLAS DE MOVIMIENTOS ----------
-- Fase 24: plantillas / favoritos de movimientos ("Mercado D1", "Gasolina", "Almuerzo").
-- Son personales (las ve quien las creó) o del hogar (household_wide: las ven todos los integrantes).
-- Solo su autor las edita o borra. Si se borra la categoría o la cuenta, la plantilla sigue (queda sin ella).

create table if not exists transaction_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null default auth.uid() references profiles(id),
  household_wide boolean not null default false,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  description text,
  amount numeric check (amount is null or amount > 0),
  category_id uuid references categories(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists transaction_templates_household_idx on transaction_templates (household_id);
alter table transaction_templates enable row level security;

drop policy if exists "ver plantillas" on transaction_templates;
create policy "ver plantillas" on transaction_templates for select using (
  public.is_household_member(household_id) and (household_wide or created_by = auth.uid())
);
drop policy if exists "crear plantillas" on transaction_templates;
create policy "crear plantillas" on transaction_templates for insert with check (
  public.is_household_member(household_id) and created_by = auth.uid()
);
drop policy if exists "editar plantillas" on transaction_templates;
create policy "editar plantillas" on transaction_templates for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists "borrar plantillas" on transaction_templates;
create policy "borrar plantillas" on transaction_templates for delete using (created_by = auth.uid());

-- ---------- FASE 25: REUNIÓN MENSUAL ----------
-- Fase 25: reunión mensual del hogar. Las decisiones que toman juntos para el próximo mes
-- (lista de { id, text, done }) se guardan por hogar y mes; las ven y editan todos los integrantes.

create table if not exists monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  decisions jsonb not null default '[]'::jsonb,
  updated_by uuid references profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (household_id, month_key)
);
alter table monthly_reviews enable row level security;

drop policy if exists "ver reuniones mensuales" on monthly_reviews;
create policy "ver reuniones mensuales" on monthly_reviews for select using (public.is_household_member(household_id));
drop policy if exists "crear reuniones mensuales" on monthly_reviews;
create policy "crear reuniones mensuales" on monthly_reviews for insert with check (public.is_household_member(household_id));
drop policy if exists "editar reuniones mensuales" on monthly_reviews;
create policy "editar reuniones mensuales" on monthly_reviews for update
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "borrar reuniones mensuales" on monthly_reviews;
create policy "borrar reuniones mensuales" on monthly_reviews for delete using (public.is_household_member(household_id));

-- ---------- FASE 26: LÍMITE DE USO DE LA API ----------
-- Fase 26: límite de uso por persona y endpoint (rate-limit real de /api/ai-parse y /api/uvr).
-- api_hit() cuenta las llamadas por hora y por día con el token del propio usuario y responde si
-- puede seguir. La tabla no tiene políticas: solo se toca a través de la función (security definer).

create table if not exists api_usage (
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  bucket text not null,
  hits int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint, bucket)
);
alter table api_usage enable row level security;

create or replace function public.api_hit(p_endpoint text, p_hourly int, p_daily int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hb text := 'h:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24');
  db text := 'd:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  h int; d int;
begin
  if uid is null then return jsonb_build_object('allowed', false, 'reason', 'no_auth'); end if;
  insert into api_usage (user_id, endpoint, bucket, hits) values (uid, p_endpoint, hb, 1)
    on conflict (user_id, endpoint, bucket) do update set hits = api_usage.hits + 1, updated_at = now()
    returning hits into h;
  insert into api_usage (user_id, endpoint, bucket, hits) values (uid, p_endpoint, db, 1)
    on conflict (user_id, endpoint, bucket) do update set hits = api_usage.hits + 1, updated_at = now()
    returning hits into d;
  if random() < 0.02 then delete from api_usage where updated_at < now() - interval '3 days'; end if;
  if h > p_hourly then
    return jsonb_build_object('allowed', false, 'reason', 'hourly',
      'retry_after', greatest(1, 3600 - extract(epoch from (now() - date_trunc('hour', now())))::int));
  end if;
  if d > p_daily then
    return jsonb_build_object('allowed', false, 'reason', 'daily',
      'retry_after', greatest(1, 86400 - extract(epoch from (now() at time zone 'utc' - date_trunc('day', now() at time zone 'utc')))::int));
  end if;
  return jsonb_build_object('allowed', true, 'hourly_remaining', p_hourly - h, 'daily_remaining', p_daily - d);
end $$;

revoke all on function public.api_hit(text, int, int) from public, anon;
grant execute on function public.api_hit(text, int, int) to authenticated;

-- ---------- FASE 27: 2FA EXIGIDA EN LA BASE ----------
-- Fase 27: la verificación en dos pasos (TOTP) se exige de verdad en la base, no solo en la pantalla.
-- Si la persona tiene un factor verificado, is_household_member() solo da acceso a los datos de un hogar
-- con una sesión que ya pasó el código (aal2). Sin factor, nada cambia. Antes, quien tenía la contraseña
-- (o el token de una sesión aal1) podía leer los datos llamando a la API directo, aunque la app pidiera el código.

create or replace function public.is_household_member(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members hm
    join profiles p on p.id = hm.user_id
    where hm.household_id = hid and hm.user_id = auth.uid() and p.status = 'active'
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
  );
$$ language sql security definer stable set search_path = public;

-- Fin del script
-- =========================================================
