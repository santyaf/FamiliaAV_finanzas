-- Solicitudes de gasto: cualquier integrante pide el visto bueno de los demás antes de un gasto grande.
-- Se aprueba con la mayoría de los OTROS integrantes activos (la persona que pide no vota); un gasto grande se
-- define con un umbral opcional del hogar (solo lo cambia un administrador). Es una ayuda de convivencia:
-- no bloquea el registro de movimientos.

alter table public.households
  add column if not exists spend_approval_threshold numeric
  check (spend_approval_threshold is null or spend_approval_threshold > 0);

create table if not exists public.spend_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  amount numeric not null check (amount > 0),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','done')),
  transaction_id uuid references public.transactions(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists spend_requests_household_idx on public.spend_requests (household_id, created_at desc);

create table if not exists public.spend_request_votes (
  request_id uuid not null references public.spend_requests(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('approve','reject')),
  comment text,
  created_at timestamptz not null default now(),
  primary key (request_id, member_id)
);

alter table public.spend_requests enable row level security;
alter table public.spend_request_votes enable row level security;

drop policy if exists "ver solicitudes" on public.spend_requests;
create policy "ver solicitudes" on public.spend_requests for select using (public.is_household_member(household_id));
drop policy if exists "crear solicitud" on public.spend_requests;
create policy "crear solicitud" on public.spend_requests for insert
  with check (public.is_household_member(household_id) and requested_by = auth.uid() and status = 'pending');
drop policy if exists "actualizar mi solicitud" on public.spend_requests;
create policy "actualizar mi solicitud" on public.spend_requests for update
  using (requested_by = auth.uid() and public.is_household_member(household_id));

drop policy if exists "ver votos de solicitudes" on public.spend_request_votes;
create policy "ver votos de solicitudes" on public.spend_request_votes for select using (
  exists (select 1 from public.spend_requests r where r.id = request_id and public.is_household_member(r.household_id))
);
drop policy if exists "votar solicitud" on public.spend_request_votes;
create policy "votar solicitud" on public.spend_request_votes for insert with check (
  member_id = auth.uid() and exists (
    select 1 from public.spend_requests r
    where r.id = request_id and r.status = 'pending' and r.requested_by <> auth.uid() and public.is_household_member(r.household_id))
);
drop policy if exists "cambiar mi voto de solicitud" on public.spend_request_votes;
create policy "cambiar mi voto de solicitud" on public.spend_request_votes for update
  using (member_id = auth.uid() and exists (select 1 from public.spend_requests r where r.id = request_id and r.status = 'pending'));

-- Quien pide solo puede cancelar (mientras está pendiente o aprobada) o marcarla registrada (si ya está aprobada);
-- aprobar o rechazar solo ocurre por los votos (los cambios hechos desde otro trigger pasan).
create or replace function public.guard_spend_request()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.household_id is distinct from old.household_id or new.requested_by is distinct from old.requested_by
     or new.amount is distinct from old.amount or new.title is distinct from old.title then
    raise exception 'Una solicitud no se edita: cancélala y crea otra';
  end if;
  if new.status is distinct from old.status and pg_trigger_depth() <= 1 then
    if not ((old.status in ('pending','approved') and new.status = 'cancelled') or (old.status = 'approved' and new.status = 'done')) then
      raise exception 'Cambio de estado no permitido';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_spend_request on public.spend_requests;
create trigger guard_spend_request before update on public.spend_requests for each row execute function public.guard_spend_request();

create or replace function public.spend_money(n numeric, cur text)
returns text language sql stable set search_path = public as $$
  select replace(to_char(n, 'FM999,999,999,999,999'), ',', '.') || ' ' || coalesce(cur, 'COP')
$$;

-- Avisa a los demás integrantes cuando llega una solicitud.
create or replace function public.notify_spend_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; cur text;
begin
  select coalesce(full_name, 'Alguien') into who from profiles where id = new.requested_by;
  select currency into cur from households where id = new.household_id;
  insert into notifications (household_id, user_id, type, title, body, data, dedupe_key)
  select new.household_id, hm.user_id, 'spend_request', 'Solicitud de gasto: ' || new.title,
         who || ' pide tu visto bueno para ' || public.spend_money(new.amount, cur),
         jsonb_build_object('requestId', new.id), 'spend-request:' || new.id || ':' || hm.user_id
  from household_members hm join profiles p on p.id = hm.user_id
  where hm.household_id = new.household_id and hm.user_id <> new.requested_by and p.status = 'active'
  on conflict (household_id, dedupe_key) do nothing;
  return new;
end $$;
drop trigger if exists notify_spend_request on public.spend_requests;
create trigger notify_spend_request after insert on public.spend_requests for each row execute function public.notify_spend_request();

-- Cuenta los votos (mayoría de los otros integrantes activos) y avisa a quien pidió cuando se decide.
create or replace function public.spend_request_recount()
returns trigger language plpgsql security definer set search_path = public as $$
declare r spend_requests%rowtype; others int; needed int; approvals int; rejections int; nstatus text; cur text;
begin
  select * into r from spend_requests where id = new.request_id for update;
  if r.status <> 'pending' then return new; end if;
  select count(*) into others from household_members hm join profiles p on p.id = hm.user_id
   where hm.household_id = r.household_id and hm.user_id <> r.requested_by and p.status = 'active';
  needed := others / 2 + 1;
  select count(*) filter (where v.vote = 'approve'), count(*) filter (where v.vote = 'reject') into approvals, rejections
    from spend_request_votes v join household_members hm on hm.user_id = v.member_id and hm.household_id = r.household_id
   where v.request_id = r.id and v.member_id <> r.requested_by;
  if approvals >= needed then nstatus := 'approved';
  elsif rejections > others - needed then nstatus := 'rejected';
  end if;
  if nstatus is not null then
    update spend_requests set status = nstatus, decided_at = now() where id = r.id;
    select currency into cur from households where id = r.household_id;
    insert into notifications (household_id, user_id, type, title, body, data, dedupe_key)
    values (r.household_id, r.requested_by, 'spend_decision',
            case when nstatus = 'approved' then 'Solicitud aprobada' else 'Solicitud rechazada' end,
            r.title || ' (' || public.spend_money(r.amount, cur) || ')' ||
              case when nstatus = 'approved' then ': ya puedes registrar el gasto.' else '.' end,
            jsonb_build_object('requestId', r.id, 'status', nstatus), 'spend-decision:' || r.id)
    on conflict (household_id, dedupe_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists spend_request_recount on public.spend_request_votes;
create trigger spend_request_recount after insert or update on public.spend_request_votes for each row execute function public.spend_request_recount();

-- funciones que solo usan los triggers: nadie más las llama
revoke execute on function public.notify_spend_request() from public, anon, authenticated;
revoke execute on function public.spend_request_recount() from public, anon, authenticated;
revoke execute on function public.guard_spend_request() from public, anon, authenticated;
