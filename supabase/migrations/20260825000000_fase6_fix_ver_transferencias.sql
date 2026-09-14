-- =========================================================
-- FASE 6 — quien RECIBE una transferencia entre integrantes también debe verla
-- =========================================================
-- Bug: can_see_transaction() no consideraba to_member_id, así que solo quien
-- ENVIABA una transferencia entre integrantes podía verla en Movimientos.
-- (la política "ver movimientos" depende de la función, así que hay que
-- borrar primero la política antes de poder borrar la función)
drop policy if exists "ver movimientos" on transactions;
drop function if exists public.can_see_transaction(text, boolean, uuid, uuid, jsonb, uuid, uuid);

create or replace function public.can_see_transaction(
  p_type text, p_is_shared boolean, p_member_id uuid, p_account_id uuid,
  p_participants jsonb, p_settlement_from uuid, p_settlement_to uuid,
  p_to_member_id uuid, p_goal_id uuid
) returns boolean as $$
  select case
    when p_type = 'settlement' then (p_settlement_from = auth.uid() or p_settlement_to = auth.uid())
    when p_type = 'transfer' and p_goal_id is null then (p_member_id = auth.uid() or p_to_member_id = auth.uid())
    when p_is_shared and p_participants is not null then (
      p_member_id = auth.uid()
      or exists (select 1 from jsonb_array_elements(p_participants) el where (el->>'memberId')::uuid = auth.uid())
    )
    else (
      p_member_id = auth.uid()
      or exists (select 1 from accounts a where a.id = p_account_id and a.type = 'shared')
    )
  end;
$$ language sql stable security definer;

create policy "ver movimientos" on transactions for select using (
  public.is_household_member(household_id)
  and public.can_see_transaction(type, is_shared, member_id, account_id, participants, settlement_from, settlement_to, to_member_id, goal_id)
);
