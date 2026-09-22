-- Errores que ocurren en el navegador de las personas, para que el administrador los vea sin depender de un servicio externo.
-- Solo guarda el mensaje, un fragmento del stack, la pantalla y el navegador (nada del contenido financiero).
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  message text not null check (length(message) <= 500),
  stack text check (stack is null or length(stack) <= 2000),
  source text not null default 'window' check (source in ('window', 'promise', 'boundary')),
  route text,
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;

drop policy if exists "reportar error" on public.client_errors;
create policy "reportar error" on public.client_errors for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "admins ven errores" on public.client_errors;
create policy "admins ven errores" on public.client_errors for select using (public.is_platform_admin());
drop policy if exists "admins limpian errores" on public.client_errors;
create policy "admins limpian errores" on public.client_errors for delete using (public.is_platform_admin());

-- tope por persona: 40 reportes por hora (un navegador con un bucle de errores no llena la tabla)
create or replace function public.limit_client_errors()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from client_errors where user_id = new.user_id and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Demasiados reportes de error';
  end if;
  return new;
end $$;
drop trigger if exists limit_client_errors on public.client_errors;
create trigger limit_client_errors before insert on public.client_errors for each row execute function public.limit_client_errors();
revoke execute on function public.limit_client_errors() from public, anon, authenticated;
