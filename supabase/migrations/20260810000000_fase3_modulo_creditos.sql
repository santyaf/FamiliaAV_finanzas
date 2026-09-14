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
