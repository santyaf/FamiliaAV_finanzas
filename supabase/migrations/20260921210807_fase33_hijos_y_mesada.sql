-- Hijos y mesada: perfiles de niños que no inician sesión (los administran los adultos del hogar), con su
-- alcancía (libro de movimientos), mesada programada, tareas con recompensa y metas de ahorro.
-- La alcancía es informativa: el gasto del hogar ocurre cuando se paga la mesada o la recompensa (un gasto
-- normal en la cuenta del adulto); lo que el niño gasta de su alcancía ya no es gasto del hogar.

create table if not exists public.kids (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  birth_date date,
  color text not null default '#5B7FA6',
  allowance_amount numeric check (allowance_amount is null or allowance_amount > 0),
  allowance_frequency text check (allowance_frequency is null or allowance_frequency in ('semanal','quincenal','mensual')),
  allowance_next_date date,
  allowance_account_id uuid references public.accounts(id) on delete set null,
  allowance_payer_id uuid references public.profiles(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.kid_ledger (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kid_id uuid not null references public.kids(id) on delete cascade,
  entry_date date not null default current_date,
  amount numeric not null check (amount <> 0),
  kind text not null check (kind in ('mesada','recompensa','regalo','gasto','compra_meta','ajuste')),
  note text,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
-- la mesada de un día se paga una sola vez aunque dos dispositivos abran la app a la vez
create unique index if not exists kid_ledger_mesada_once on public.kid_ledger (kid_id, entry_date) where kind = 'mesada';
create index if not exists kid_ledger_kid_idx on public.kid_ledger (kid_id, entry_date desc);

create table if not exists public.kid_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kid_id uuid not null references public.kids(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  reward numeric not null check (reward > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.kid_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kid_id uuid not null references public.kids(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  target_amount numeric not null check (target_amount > 0),
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.kids enable row level security;
alter table public.kid_ledger enable row level security;
alter table public.kid_tasks enable row level security;
alter table public.kid_goals enable row level security;

drop policy if exists "hijos: ver" on public.kids;
create policy "hijos: ver" on public.kids for select using (public.is_household_member(household_id));
drop policy if exists "hijos: crear" on public.kids;
create policy "hijos: crear" on public.kids for insert with check (public.is_household_member(household_id));
drop policy if exists "hijos: editar" on public.kids;
create policy "hijos: editar" on public.kids for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists "hijos: borrar" on public.kids;
create policy "hijos: borrar" on public.kids for delete using (public.is_household_member(household_id));

do $$
declare t text;
begin
  foreach t in array array['kid_ledger', 'kid_tasks', 'kid_goals'] loop
    execute format('drop policy if exists "%1$s: ver" on public.%1$s', t);
    execute format('create policy "%1$s: ver" on public.%1$s for select using (public.is_household_member(household_id))', t);
    execute format('drop policy if exists "%1$s: crear" on public.%1$s', t);
    execute format('create policy "%1$s: crear" on public.%1$s for insert with check (public.is_household_member(household_id) and exists (select 1 from public.kids k where k.id = kid_id and k.household_id = %1$s.household_id))', t);
    execute format('drop policy if exists "%1$s: editar" on public.%1$s', t);
    execute format('create policy "%1$s: editar" on public.%1$s for update using (public.is_household_member(household_id))', t);
    execute format('drop policy if exists "%1$s: borrar" on public.%1$s', t);
    execute format('create policy "%1$s: borrar" on public.%1$s for delete using (public.is_household_member(household_id))', t);
  end loop;
end $$;
