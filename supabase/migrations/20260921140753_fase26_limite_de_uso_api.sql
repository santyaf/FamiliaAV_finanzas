-- Fase 26: límite de uso por persona y endpoint (rate-limit real de /api/ai-parse y /api/uvr).
-- api_hit() cuenta las llamadas por hora y por día con el token del propio usuario y responde si
-- puede seguir. La tabla no tiene políticas: solo se toca a través de la función (security definer).

create table if not exists api_usage (
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  bucket text not null,
  hits int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint, bucket)
);
alter table api_usage enable row level security;

create or replace function public.api_hit(p_endpoint text, p_hourly int, p_daily int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  hb text := 'h:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24');
  db text := 'd:' || to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  h int; d int;
begin
  if uid is null then return jsonb_build_object('allowed', false, 'reason', 'no_auth'); end if;
  insert into api_usage (user_id, endpoint, bucket, hits) values (uid, p_endpoint, hb, 1)
    on conflict (user_id, endpoint, bucket) do update set hits = api_usage.hits + 1, updated_at = now()
    returning hits into h;
  insert into api_usage (user_id, endpoint, bucket, hits) values (uid, p_endpoint, db, 1)
    on conflict (user_id, endpoint, bucket) do update set hits = api_usage.hits + 1, updated_at = now()
    returning hits into d;
  if random() < 0.02 then delete from api_usage where updated_at < now() - interval '3 days'; end if;
  if h > p_hourly then
    return jsonb_build_object('allowed', false, 'reason', 'hourly',
      'retry_after', greatest(1, 3600 - extract(epoch from (now() - date_trunc('hour', now())))::int));
  end if;
  if d > p_daily then
    return jsonb_build_object('allowed', false, 'reason', 'daily',
      'retry_after', greatest(1, 86400 - extract(epoch from (now() at time zone 'utc' - date_trunc('day', now() at time zone 'utc')))::int));
  end if;
  return jsonb_build_object('allowed', true, 'hourly_remaining', p_hourly - h, 'daily_remaining', p_daily - d);
end $$;

revoke all on function public.api_hit(text, int, int) from public, anon;
grant execute on function public.api_hit(text, int, int) to authenticated;
