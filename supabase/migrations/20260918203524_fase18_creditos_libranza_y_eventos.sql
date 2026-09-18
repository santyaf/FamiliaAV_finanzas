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
