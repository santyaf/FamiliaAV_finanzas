-- =========================================================
-- FASE 12 — OBLIGACIONES (recordatorios de pagos recurrentes)
-- =========================================================
-- Recordatorios push de pagos que no se deben olvidar (arriendo, servicios,
-- suscripciones...), por integrante o de todo el hogar, con monto opcional
-- (vacío = variable, ej. servicios públicos). El recordatorio, al tocarlo,
-- abre la app lista para registrar ese gasto.
-- =========================================================

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

alter function public.is_household_member(uuid) set search_path = public;
