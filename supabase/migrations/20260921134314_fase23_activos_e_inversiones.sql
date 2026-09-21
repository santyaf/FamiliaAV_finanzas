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
