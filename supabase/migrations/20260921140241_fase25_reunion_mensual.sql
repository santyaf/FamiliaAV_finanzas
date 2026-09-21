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
