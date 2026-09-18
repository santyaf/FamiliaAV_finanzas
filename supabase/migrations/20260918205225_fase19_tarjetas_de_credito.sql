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
