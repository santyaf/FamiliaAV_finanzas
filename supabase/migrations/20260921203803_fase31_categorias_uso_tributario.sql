-- Uso tributario de cada categoría (ayuda para la declaración de renta): ingresos laborales o de capital y
-- gastos que pueden ser deducibles. Es una etiqueta orientativa; no cambia ningún cálculo contable.
alter table public.categories
  add column if not exists tax_tag text
  check (tax_tag is null or tax_tag in ('laboral','capital','vivienda','salud','educacion','afc','donaciones','gmf'));

update public.categories set tax_tag = 'laboral' where tax_tag is null and type = 'income' and name in ('Salario', 'Negocio / Freelance');
update public.categories set tax_tag = 'capital' where tax_tag is null and type = 'income' and name in ('Rentas', 'Inversiones');
