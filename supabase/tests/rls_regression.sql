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
  tx uuid; rid uuid; acct uuid; goal uuid; kid uuid; scat uuid; sacct uuid; t1 uuid; t2 uuid;
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

  -- ================= 9. Hijos y mesada: solo el hogar, una mesada por día, sin cruzar hogares =================
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into kids (household_id, name) values (h, '__nino') returning id into kid;
  insert into kid_ledger (household_id, kid_id, amount, kind, entry_date) values (h, kid, 100, 'mesada', current_date);
  begin
    insert into kid_ledger (household_id, kid_id, amount, kind, entry_date) values (h, kid, 100, 'mesada', current_date);
    okk := false;
  exception when unique_violation then okk := true; when others then okk := false; end;
  if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'la mesada de un día no se duplica; ';
  begin
    insert into kid_ledger (household_id, kid_id, amount, kind) values (gen_random_uuid(), kid, 5, 'regalo');
    okk := false;
  exception when others then okk := true; end;
  if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'no se anota en la alcancía con otro hogar; ';
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from kids where id = kid;
  okk := n = 1; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'el otro adulto del hogar ve al niño; ';
  reset role;
  if c is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from kids where id = kid;
    okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'un extraño no ve al niño; ';
    begin
      insert into kid_goals (household_id, kid_id, name, target_amount) values (h, kid, '__meta', 10);
      okk := false;
    exception when others then okk := true; end;
    if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'un extraño no agrega metas; ';
    reset role;
  end if;

  -- ================= 10. Movimientos sorpresa: ocultos a los demás hasta su fecha =================
  select id into sacct from accounts where household_id = h and type = 'shared' limit 1;
  select id into scat from categories where household_id = h and type = 'expense' limit 1;
  if sacct is not null and scat is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into transactions (household_id, type, description, amount, category_id, account_id, member_id, date, created_by, private_until)
      values (h, 'expense', '__sorpresa', 1000, scat, sacct, a, current_date, b, '9999-12-31') returning id into t1;
    insert into transactions (household_id, type, description, amount, category_id, account_id, member_id, date, created_by, private_until)
      values (h, 'expense', '__revelada', 1000, scat, sacct, a, current_date, a, (now() at time zone 'America/Bogota')::date - 1) returning id into t2;
    reset role;
    select count(*) into n from transactions where id = t1 and created_by = a;
    okk := n = 1; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'created_by lo fija la sesión; ';
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into n from transactions where id = t1;
    okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'el otro integrante no ve la sorpresa; ';
    select count(*) into n from transactions where id = t2;
    okk := n = 1; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'con la fecha vencida se ve; ';
    begin update transactions set private_until = null where id = t2; okk := false; exception when others then okk := true; end;
    if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'otro no cambia la privacidad; ';
    update transactions set description = 'hack' where id = t1;
    get diagnostics n = row_count;
    okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'otro no edita la oculta; ';
    delete from transactions where id = t1;
    get diagnostics n = row_count;
    okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'otro no borra la oculta; ';
    reset role;
  else res := res || 'omitida(sorpresa: sin cuenta compartida); '; end if;

  -- ================= 11. Errores del navegador: cada quien reporta los suyos, solo el administrador los lee =================
  if nonadmin is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', nonadmin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into client_errors (message, source, route) values ('__prueba', 'window', '#/x');
    begin insert into client_errors (user_id, message) values (case when nonadmin = a then b else a end, '__suplantado'); okk := false;
    exception when others then okk := true; end;
    if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'no se reporta a nombre de otro; ';
    select count(*) into n from client_errors;
    okk := n = 0; if not okk then fails := fails + 1; end if; res := res || case when okk then 'ok ' else 'FALLA ' end || 'un no-admin no lee reportes; ';
    reset role;
  end if;

  raise exception 'RESULTADO: % | FALLAS=%', res, fails;
end $$;
