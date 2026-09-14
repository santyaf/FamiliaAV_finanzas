-- =========================================================
-- FASE 10 — guardas a nivel de base de datos + endurecimiento
-- =========================================================
-- Documenta funciones/triggers que ya existían en la base real (agregados
-- por fuera de este archivo) + endurecimiento de seguridad: search_path
-- fijo en las funciones SECURITY DEFINER ("Function Search Path Mutable").
-- =========================================================

-- Estas dos funciones + triggers son una segunda capa de protección (a nivel
-- de base de datos, no solo en la app) para que un objetivo FAMILIAR nunca
-- pueda editarse ni recibir un retiro sin pasar por vote_and_resolve_goal_request().
create or replace function public.guard_family_goal_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if current_setting('app.bypass_goal_guard', true) = 'true' then
    return new; -- solo lo activa vote_and_resolve_goal_request()
  end if;
  if old.owner_member_id is null then
    if new.target_amount is distinct from old.target_amount or new.target_date is distinct from old.target_date then
      raise exception 'Editar la meta de un objetivo familiar requiere aprobación unánime del hogar.';
    end if;
    if new.current_amount < old.current_amount then
      raise exception 'Retirar saldo de un objetivo familiar requiere aprobación unánime del hogar.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_family_goal_changes on goals;
create trigger guard_family_goal_changes before update on public.goals
  for each row execute function guard_family_goal_changes();

create or replace function public.guard_family_goal_withdraw_tx()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  is_family boolean;
begin
  if current_setting('app.bypass_goal_guard', true) = 'true' then
    return new;
  end if;
  if new.type = 'transfer' and new.transfer_direction = 'withdraw' and new.goal_id is not null then
    select (owner_member_id is null) into is_family from goals where id = new.goal_id;
    if is_family then
      raise exception 'Retirar saldo de un objetivo familiar requiere aprobación unánime del hogar.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists guard_family_goal_withdraw_tx on transactions;
create trigger guard_family_goal_withdraw_tx before insert on public.transactions
  for each row execute function guard_family_goal_withdraw_tx();

-- Vota y, si con ese voto se llega a unanimidad, aplica el cambio en la misma
-- transacción (evita condiciones de carrera del enfoque anterior de "votar y
-- luego revisar si ya se puede aplicar" desde el cliente en dos pasos separados).
-- Es la ÚNICA forma de que un cambio a un objetivo familiar realmente se aplique
-- (activa app.bypass_goal_guard solo dentro de su propia transacción).
create or replace function public.vote_and_resolve_goal_request(p_request_id uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  req goal_change_requests%rowtype;
  member_count int;
  approved_count int;
  any_rejected boolean;
begin
  select * into req from goal_change_requests where id = p_request_id for update;
  if req.id is null then
    raise exception 'Solicitud no encontrada';
  end if;
  if not public.is_household_member(req.household_id) then
    raise exception 'No autorizado';
  end if;
  if req.status <> 'pending' then
    return req.status;
  end if;

  insert into goal_change_votes (request_id, member_id, approve)
  values (p_request_id, auth.uid(), p_approve)
  on conflict (request_id, member_id) do update set approve = excluded.approve, voted_at = now();

  select count(*) into member_count from household_members where household_id = req.household_id;

  select count(*) filter (where v.approve = true) into approved_count
  from goal_change_votes v
  join household_members hm on hm.user_id = v.member_id and hm.household_id = req.household_id
  where v.request_id = p_request_id;

  select exists (
    select 1
    from goal_change_votes v
    join household_members hm on hm.user_id = v.member_id and hm.household_id = req.household_id
    where v.request_id = p_request_id and v.approve = false
  ) into any_rejected;

  if any_rejected then
    update goal_change_requests set status = 'rejected', resolved_at = now() where id = p_request_id;
    return 'rejected';
  end if;

  if approved_count >= member_count then
    perform set_config('app.bypass_goal_guard', 'true', true); -- true = solo esta transacción

    if req.change_type = 'edit_target' then
      update goals set target_amount = req.new_target_amount, target_date = req.new_target_date
      where id = req.goal_id;
    elsif req.change_type = 'withdraw' then
      insert into transactions (
        household_id, type, description, amount, account_id, member_id,
        goal_id, transfer_direction, date, created_by
      ) values (
        req.household_id, 'transfer', 'Retiro aprobado de objetivo familiar', req.withdraw_amount,
        req.withdraw_account_id, req.withdraw_member_id, req.goal_id, 'withdraw', current_date, req.requested_by
      );
      update goals set current_amount = greatest(0, current_amount - req.withdraw_amount) where id = req.goal_id;
    end if;

    update goal_change_requests set status = 'approved', resolved_at = now() where id = p_request_id;
    return 'approved';
  end if;

  return 'pending';
end;
$function$;

-- Event trigger de mantenimiento: activa RLS automáticamente en cualquier
-- tabla nueva que se cree en public (red de seguridad extra por si algún día
-- se agrega una tabla y alguien olvida el "alter table ... enable row level security").
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function rls_auto_enable();

-- Endurecimiento: fija search_path en todas las funciones SECURITY DEFINER
-- (alerta "Function Search Path Mutable" del linter de seguridad de Supabase).
alter function public.handle_new_user() set search_path = public;
alter function public.is_household_member(uuid) set search_path = public;
alter function public.redeem_invite(text) set search_path = public;
alter function public.set_created_by() set search_path = public;
alter function public.is_platform_admin() set search_path = public;
alter function public.admin_promote_by_email(text) set search_path = public;
alter function public.can_see_transaction(text, boolean, uuid, uuid, jsonb, uuid, uuid, uuid, uuid) set search_path = public;
