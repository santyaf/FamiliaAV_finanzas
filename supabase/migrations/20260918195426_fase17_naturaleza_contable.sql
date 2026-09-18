-- Fase 17: base para los estados financieros (Resultados, Flujo de efectivo).
-- Cada categoría trae un rubro y una naturaleza contable; un movimiento puede
-- anular esa naturaleza. Así el saldo inicial de una cuenta, un préstamo
-- recibido o el capital de una deuda no se mezclan con ingresos/gastos operativos.

alter table categories
  add column if not exists group_name text,
  add column if not exists nature text not null default 'operativo'
    check (nature in ('operativo', 'financiamiento', 'inversion')),
  add column if not exists is_fixed boolean not null default false;

alter table transactions
  add column if not exists nature text
    check (nature in ('operativo', 'financiamiento', 'inversion', 'apertura'));   -- null = la de su categoría

-- Cuota de crédito pagada = 2 movimientos: capital (financiamiento) + intereses/seguro (gasto).
-- transaction_id sigue apuntando al de capital; este apunta al de intereses/seguro.
alter table credit_payments
  add column if not exists interest_transaction_id uuid references transactions(id) on delete set null;

-- Editar categorías: nunca existió la política de UPDATE (mismo hueco que tenía accounts).
drop policy if exists "actualizar categorias" on categories;
create policy "actualizar categorias" on categories for update
  using (is_household_member(household_id)) with check (is_household_member(household_id));

-- Clasificación de las categorías por defecto que ya existen en los hogares.
update categories set group_name = 'Ingresos laborales' where name in ('Salario', 'Negocio / Freelance') and type = 'income';
update categories set group_name = 'Ingresos por activos' where name in ('Rentas', 'Inversiones') and type = 'income';
update categories set group_name = 'Otros ingresos' where name = 'Otros ingresos' and type = 'income';
update categories set group_name = 'Vivienda y servicios', is_fixed = true where name = 'Vivienda' and type = 'expense';
update categories set group_name = 'Vivienda y servicios' where name = 'Servicios (luz/agua/internet)' and type = 'expense';
update categories set group_name = 'Alimentación' where name = 'Alimentación' and type = 'expense';
update categories set group_name = 'Transporte' where name = 'Transporte' and type = 'expense';
update categories set group_name = 'Salud' where name = 'Salud' and type = 'expense';
update categories set group_name = 'Educación', is_fixed = true where name = 'Educación' and type = 'expense';
update categories set group_name = 'Estilo de vida' where name in ('Ocio y entretenimiento', 'Ropa') and type = 'expense';
update categories set group_name = 'Otros' where name = 'Otros gastos' and type = 'expense';
update categories set group_name = 'Deudas', nature = 'financiamiento', is_fixed = true where name = 'Deudas y préstamos' and type = 'expense';
update categories set group_name = 'Ahorro e inversión', nature = 'inversion' where name = 'Ahorro / Inversión' and type = 'expense';

-- Categorías nuevas para todos los hogares: intereses (gasto) y préstamos recibidos (ingreso por financiamiento).
insert into categories (household_id, name, type, icon, group_name, nature, is_fixed)
select h.id, 'Intereses y comisiones', 'expense', 'credit-card', 'Costos financieros', 'operativo', false
from households h
where not exists (select 1 from categories c where c.household_id = h.id and c.name = 'Intereses y comisiones' and c.type = 'expense');
insert into categories (household_id, name, type, icon, group_name, nature, is_fixed)
select h.id, 'Préstamos recibidos', 'income', 'plus', 'Financiamiento', 'financiamiento', false
from households h
where not exists (select 1 from categories c where c.household_id = h.id and c.name = 'Préstamos recibidos' and c.type = 'income');

-- Los saldos iniciales de cuentas se guardaron como ingresos: son apertura, no ingreso del período.
update transactions set nature = 'apertura' where type = 'income' and description = 'Saldo inicial' and nature is null;
