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
