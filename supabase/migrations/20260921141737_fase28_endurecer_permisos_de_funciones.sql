-- Fase 28: permisos de las funciones SECURITY DEFINER (hallazgo del asesor de seguridad de Supabase:
-- 14 funciones ejecutables por el rol anónimo desde /rest/v1/rpc/...).
--  - Solo-trigger (set_created_by, guard_*, notify_*, rls_auto_enable, handle_new_user): nadie las llama por la API.
--    Los triggers siguen disparando (Postgres no comprueba EXECUTE al disparar; verificado insertando en
--    transactions, goals, suggestions y households con el rol authenticated).
--  - Apoyo de políticas y RPC de la app: solo con sesión iniciada (authenticated) y service_role.

revoke execute on function public.set_created_by() from public, anon, authenticated;
revoke execute on function public.guard_family_goal_changes() from public, anon, authenticated;
revoke execute on function public.guard_family_goal_withdraw_tx() from public, anon, authenticated;
revoke execute on function public.notify_admins_new_suggestion() from public, anon, authenticated;
revoke execute on function public.notify_author_suggestion_status() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_household_member(uuid) from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.can_see_transaction(text, boolean, uuid, uuid, jsonb, uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function public.shares_household_with(uuid) from public, anon;
revoke execute on function public.admin_promote_by_email(text) from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;
revoke execute on function public.vote_and_resolve_goal_request(uuid, boolean) from public, anon;

grant execute on function public.is_household_member(uuid) to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.can_see_transaction(text, boolean, uuid, uuid, jsonb, uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.shares_household_with(uuid) to authenticated, service_role;
grant execute on function public.admin_promote_by_email(text) to authenticated, service_role;
grant execute on function public.redeem_invite(text) to authenticated, service_role;
grant execute on function public.vote_and_resolve_goal_request(uuid, boolean) to authenticated, service_role;
