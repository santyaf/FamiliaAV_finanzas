-- Movimientos «sorpresa»: quien registra un movimiento puede ocultarlo a los demás integrantes hasta una fecha
-- (9999-12-31 = siempre). Sirve para un regalo o un gasto personal dentro de una cuenta compartida. Lo oculta la
-- base (RLS): quien lo creó lo ve siempre; los demás, hasta que llegue la fecha (día de Colombia).
alter table public.transactions add column if not exists private_until date;

-- created_by sale siempre de la sesión (antes lo mandaba el navegador): la privacidad no puede depender de un dato falsificable
create or replace function public.set_transactions_created_by()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists set_transactions_created_by on public.transactions;
create trigger set_transactions_created_by before insert on public.transactions for each row execute function public.set_transactions_created_by();

-- solo quien creó el movimiento cambia si está oculto
create or replace function public.guard_transaction_privacy()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.private_until is distinct from old.private_until and current_user in ('authenticated', 'anon')
     and auth.uid() is distinct from old.created_by then
    raise exception 'Solo quien registró el movimiento puede ocultarlo o mostrarlo';
  end if;
  return new;
end $$;
drop trigger if exists guard_transaction_privacy on public.transactions;
create trigger guard_transaction_privacy before update on public.transactions for each row execute function public.guard_transaction_privacy();

drop policy if exists "ver movimientos" on public.transactions;
create policy "ver movimientos" on public.transactions for select using (
  public.is_household_member(household_id)
  and public.can_see_transaction(type, is_shared, member_id, account_id, participants, settlement_from, settlement_to, to_member_id, goal_id, to_account_id)
  and (private_until is null or private_until <= (now() at time zone 'America/Bogota')::date or created_by = auth.uid())
);

revoke execute on function public.set_transactions_created_by() from public, anon, authenticated;
revoke execute on function public.guard_transaction_privacy() from public, anon, authenticated;
