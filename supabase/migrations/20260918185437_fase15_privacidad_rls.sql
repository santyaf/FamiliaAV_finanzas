-- Fase 15 (privacidad): endurece políticas RLS tras una auditoría.

-- 1) Editar una cuenta: nunca hubo política de UPDATE en accounts, así que
--    "editar cuenta" no guardaba nada (0 filas afectadas, sin error). Ahora
--    puede editarla quien la ve: cualquiera del hogar si es compartida, solo
--    su(s) dueño(s) si es individual.
create policy "actualizar cuentas" on accounts for update
  using (is_household_member(household_id) and (type = 'shared' or auth.uid() = any(owner_ids)))
  with check (is_household_member(household_id));

-- 2) Crear movimientos: solo a nombre propio (created_by) y solo sobre cuentas
--    que esa persona puede ver (las individuales de otro integrante no).
--    Antes bastaba con ser del hogar: se podían inyectar movimientos en la
--    cuenta individual de otra persona.
drop policy if exists "crear movimientos" on transactions;
create policy "crear movimientos" on transactions for insert
  with check (
    is_household_member(household_id)
    and created_by = auth.uid()
    and (account_id is null or exists (select 1 from accounts a where a.id = account_id))
  );

-- 3) Perfiles: antes cualquier usuario autenticado podía leer el nombre de
--    todos los usuarios de la plataforma. Ahora solo el propio, el de quienes
--    comparten hogar contigo y (para la administración) los admins de plataforma.
create or replace function shares_household_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from household_members a
    join household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;
drop policy if exists "leer perfiles" on profiles;
create policy "leer perfiles" on profiles for select
  using (id = auth.uid() or shares_household_with(id) or is_platform_admin());
