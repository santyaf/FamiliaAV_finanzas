-- Fase 27: la verificación en dos pasos (TOTP) se exige de verdad en la base, no solo en la pantalla.
-- Si la persona tiene un factor verificado, is_household_member() solo da acceso a los datos de un hogar
-- con una sesión que ya pasó el código (aal2). Sin factor, nada cambia. Antes, quien tenía la contraseña
-- (o el token de una sesión aal1) podía leer los datos llamando a la API directo, aunque la app pidiera el código.

create or replace function public.is_household_member(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members hm
    join profiles p on p.id = hm.user_id
    where hm.household_id = hid and hm.user_id = auth.uid() and p.status = 'active'
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
  );
$$ language sql security definer stable set search_path = public;
