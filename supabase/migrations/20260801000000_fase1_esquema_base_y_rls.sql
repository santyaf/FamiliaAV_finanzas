-- =========================================================
-- FASE 1 — esquema base (perfiles, hogares, movimientos,
-- objetivos, presupuestos) + Row Level Security
-- =========================================================
-- Nota: el timestamp de este archivo es aproximado. La base original se
-- aplicó de una sola vez pegando supabase-schema.sql en el SQL Editor,
-- sin pasar por el historial de migraciones de Supabase (por eso no hay
-- un timestamp real registrado para esta fase). A partir de la Fase 9 sí
-- quedó registro real en supabase_migrations.schema_migrations, y esos
-- dos archivos de este directorio conservan sus timestamps reales.
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
create policy "crear movimientos" on transactions for insert with check (public.is_household_member(household_id));
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
