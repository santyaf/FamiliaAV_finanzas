-- Fase 24: plantillas / favoritos de movimientos ("Mercado D1", "Gasolina", "Almuerzo").
-- Son personales (las ve quien las creó) o del hogar (household_wide: las ven todos los integrantes).
-- Solo su autor las edita o borra. Si se borra la categoría o la cuenta, la plantilla sigue (queda sin ella).

create table if not exists transaction_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null default auth.uid() references profiles(id),
  household_wide boolean not null default false,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  description text,
  amount numeric check (amount is null or amount > 0),
  category_id uuid references categories(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists transaction_templates_household_idx on transaction_templates (household_id);
alter table transaction_templates enable row level security;

drop policy if exists "ver plantillas" on transaction_templates;
create policy "ver plantillas" on transaction_templates for select using (
  public.is_household_member(household_id) and (household_wide or created_by = auth.uid())
);
drop policy if exists "crear plantillas" on transaction_templates;
create policy "crear plantillas" on transaction_templates for insert with check (
  public.is_household_member(household_id) and created_by = auth.uid()
);
drop policy if exists "editar plantillas" on transaction_templates;
create policy "editar plantillas" on transaction_templates for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists "borrar plantillas" on transaction_templates;
create policy "borrar plantillas" on transaction_templates for delete using (created_by = auth.uid());
