-- Fase 19b: una transferencia entre cuentas (ej. pagar una tarjeta compartida desde una
-- cuenta individual) ahora la ve todo el hogar cuando la cuenta de origen o de destino es
-- COMPARTIDA. Antes solo la veían el integrante que la hizo y el destinatario, así que el
-- saldo de una cuenta compartida quedaba distinto para cada integrante.
-- Las transferencias entre cuentas individuales siguen siendo privadas.

create or replace function public.can_see_transaction(
  p_type text, p_is_shared boolean, p_member_id uuid, p_account_id uuid,
  p_participants jsonb, p_settlement_from uuid, p_settlement_to uuid,
  p_to_member_id uuid, p_goal_id uuid, p_to_account_id uuid
) returns boolean as $$
  select case
    when p_type = 'settlement' then (p_settlement_from = auth.uid() or p_settlement_to = auth.uid())
    when p_type = 'transfer' and p_goal_id is null then (
      p_member_id = auth.uid() or p_to_member_id = auth.uid()
      or exists (select 1 from accounts a where a.id in (p_account_id, p_to_account_id) and a.type = 'shared')
    )
    when p_is_shared and p_participants is not null then (
      p_member_id = auth.uid()
      or exists (select 1 from jsonb_array_elements(p_participants) el where (el->>'memberId')::uuid = auth.uid())
    )
    else (
      p_member_id = auth.uid()
      or exists (select 1 from accounts a where a.id = p_account_id and a.type = 'shared')
    )
  end;
$$ language sql stable security definer set search_path = public;

drop policy if exists "ver movimientos" on transactions;
create policy "ver movimientos" on transactions for select using (
  public.is_household_member(household_id)
  and public.can_see_transaction(type, is_shared, member_id, account_id, participants, settlement_from, settlement_to, to_member_id, goal_id, to_account_id)
);

drop function if exists public.can_see_transaction(text, boolean, uuid, uuid, jsonb, uuid, uuid, uuid, uuid);
