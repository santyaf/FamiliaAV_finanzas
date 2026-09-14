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
