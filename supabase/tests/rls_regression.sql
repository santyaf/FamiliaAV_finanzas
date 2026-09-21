-- Pruebas de regresión de seguridad (RLS, permisos y reglas de la base).
--
-- Cómo correrlas: pegar TODO este archivo en el editor SQL de Supabase, o con la herramienta execute_sql del
-- MCP de Supabase. No dejan nada: todo ocurre dentro de un bloque que termina con RAISE EXCEPTION, y ese error
-- (con el resumen) deshace cada cambio. Lo esperado es que el mensaje termine en "FALLAS=0".
--
-- Usan datos reales (un hogar con al menos 2 integrantes activos y, si existe, una persona de otro hogar) y
-- simulan cada sesión con el rol `authenticated` y los claims del JWT. Córrelas después de cada migración que
-- toque políticas, funciones o permisos.

do $$
declare
  h uuid; a uuid; b uuid; c uuid; nonadmin uuid;
  tx uuid; rid uuid; acct uuid; goal uuid;
  n int; fails int := 0; res text := '';
  okk boolean;
begin
  -- ---- datos de prueba: un hogar con 2 integrantes activos (a, b) y alguien de otro hogar (c)
  select hm.household_id, (array_agg(hm.user_id order by hm.joined_at))[1], (array_agg(hm.user_id order by hm.joined_at))[2]
    into h, a, b
    from household_members hm join profiles p on p.id = hm.user_id and p.status = 'active'
   group by hm.household_id having count(*) >= 2 limit 1;
  if h is null then raise exception 'RESULTADO: no hay un hogar con 2 integrantes activos para probar'; end if;
  select hm.user_id into c from household_members hm join profiles p on p.id = hm.user_id and p.status = 'active'
   where hm.household_id <> h and hm.user_id not in (a, b) limit 1;
  select p.id into nonadmin from profiles p where p.id in (a, b) and not exists (select 1 from platform_admins x where x.user_id = p.id) limit 1;

  -- ================= 1. Privacidad: lo individual solo lo ve su dueño =================
  insert into accounts (household_id, name, type, owner_ids) values (h, '__prueba_privada', 'individual', array[a]) returning id into acct;
  insert into goals (household_id, name, target_amount, owner_member_id) values (h, '__meta_privada', 100, a) returning id into goal;

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from accounts where id = acct;
  okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'cuenta individual oculta a otro integrante; ';
  select count(*) into n from goals where id = goal;
  okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'objetivo individual oculto; ';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from accounts where id = acct;
  okk := n = 1; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'la dueña sí ve su cuenta; ';
  reset role;

  -- ================= 2. Alguien de otro hogar no ve nada de este =================
  if c is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from accounts where household_id = h;
    okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'un extraño no ve cuentas del hogar; ';
    select count(*) into n from transactions where household_id = h;
    okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'un extraño no ve movimientos; ';
    reset role;
  else res := res || 'omitida(sin persona de otro hogar); '; end if;

  -- ================= 3. Segundo factor: con MFA verificado, sin aal2 no hay datos =================
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values (gen_random_uuid(), a, '__prueba', 'totp', 'verified', now(), now());
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  set local role authenticated;
  select count(*) into n from accounts where household_id = h;
  okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'con 2FA y sesión aal1 no se ven datos; ';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into n from accounts where household_id = h;
  okk := n > 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'con aal2 sí se ven; ';
  reset role;
  delete from auth.mfa_factors where user_id = a and friendly_name = '__prueba';

  -- ================= 4. Cuenta desactivada: deja de ver datos, y no puede reactivarse sola si la suspendieron =================
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform deactivate_my_account();
  select count(*) into n from accounts where household_id = h;
  okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'cuenta desactivada no ve datos; ';
  begin
    update profiles set status = 'active' where id = b;
    okk := false;
  exception when others then okk := true; end;
  if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'no se puede cambiar el estado editando el perfil; ';
  reset role;
  update profiles set status = 'active' where id = b; -- (como propietario de la base: se deshace igual al final)

  -- ================= 5. Recibos: la carpeta debe ser <hogar>/<movimiento> de un hogar propio =================
  select id into tx from transactions where household_id = h limit 1;
  if tx is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      insert into storage.objects (bucket_id, name, owner) values ('receipts', h || '/' || tx || '/prueba.txt', a);
      okk := true;
    exception when others then okk := false; end;
    if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'subir a la carpeta de mi hogar; ';
    begin
      insert into storage.objects (bucket_id, name, owner) values ('receipts', gen_random_uuid() || '/' || tx || '/ajeno.txt', a);
      okk := false;
    exception when others then okk := true; end;
    if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'no subir a la carpeta de otro hogar; ';
    reset role;
    if c is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
      set local role authenticated;
      begin
        insert into storage.objects (bucket_id, name, owner) values ('receipts', h || '/' || tx || '/intruso.txt', c);
        okk := false;
      exception when others then okk := true; end;
      if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'un extraño no sube a mi carpeta; ';
      select count(*) into n from storage.objects where bucket_id = 'receipts' and name like h || '/%';
      okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'un extraño no lista mis recibos; ';
      reset role;
    end if;
  else res := res || 'omitida(recibos: sin movimientos); '; end if;

  -- ================= 6. Ningún SECURITY DEFINER es ejecutable por el rol anónimo =================
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute');
  okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA(' || n || ') ' end || 'anon sin funciones SECURITY DEFINER; ';

  -- ================= 7. Latido del cron: solo lo lee un administrador de la plataforma =================
  insert into cron_heartbeat (job, last_ok) values ('__prueba', true) on conflict (job) do nothing;
  if nonadmin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', nonadmin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from cron_heartbeat;
    okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'un no-admin no lee el latido; ';
    begin
      insert into cron_heartbeat (job) values ('__intruso'); okk := false;
    exception when others then okk := true; end;
    if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'nadie escribe el latido desde la app; ';
    reset role;
  else res := res || 'omitida(latido: todos son admin); '; end if;

  -- ================= 8. Solicitudes de gasto: mayoría, sin autovoto, sin saltarse la votación =================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into spend_requests (household_id, requested_by, title, amount) values (h, a, '__prueba', 1000) returning id into rid;
  begin insert into spend_request_votes (request_id, member_id, vote) values (rid, a, 'approve'); okk := false;
  exception when others then okk := true; end;
  if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'no se vota la propia solicitud; ';
  begin update spend_requests set status = 'approved' where id = rid; okk := false;
  exception when others then okk := true; end;
  if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'no se aprueba a mano; ';
  begin update spend_requests set amount = 1 where id = rid; okk := false;
  exception when others then okk := true; end;
  if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'no se edita el monto; ';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into spend_request_votes (request_id, member_id, vote) values (rid, b, 'approve');
  reset role;
  select count(*) into n from spend_requests where id = rid and status = 'approved';
  okk := n = 1; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'el voto del otro integrante la aprueba; ';
  select count(*) into n from notifications where dedupe_key = 'spend-decision:' || rid;
  okk := n = 1; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'avisa la decisión; ';

  raise exception 'RESULTADO: % | FALLAS=%', res, fails;
end $$;
