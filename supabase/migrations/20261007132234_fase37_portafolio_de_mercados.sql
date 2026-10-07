-- Portafolio de mercados (divisas, criptoactivos y acciones), dentro de Activos e inversiones.
--  - holdings: cada instrumento que se sigue (USD, bitcoin, ECO…). owner_member_id null = del hogar.
--  - holding_trades: compras y ventas con unidades y pesos; el costo promedio ponderado y la ganancia realizada
--    se calculan con ellas. Si se pagó/recibió desde una cuenta de la app, queda ligada a su movimiento.
--  - holding_prices: precio en pesos por día (se guarda al consultar el mercado) para valorar el portafolio
--    en fechas pasadas en el Estado de Situación Financiera.
--  - investment_settings: fuente de la tasa de dólar (TRM o la de Wenia, a mano) y aviso cuando la TRM supera
--    el costo promedio de los dólares.

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  owner_member_id uuid references public.profiles(id) on delete cascade,
  asset_class text not null check (asset_class in ('divisa', 'cripto', 'accion')),
  symbol text not null check (length(btrim(symbol)) > 0),
  name text not null check (length(btrim(name)) > 0),
  exchange text,
  quote_currency text,
  archived boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index if not exists holdings_unique on public.holdings
  (household_id, coalesce(owner_member_id, '00000000-0000-0000-0000-000000000000'::uuid), asset_class, symbol);

create table if not exists public.holding_trades (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  holding_id uuid not null references public.holdings(id) on delete cascade,
  trade_date date not null,
  side text not null check (side in ('compra', 'venta')),
  units numeric not null check (units > 0),
  cop_amount numeric not null check (cop_amount > 0),
  fx_rate numeric check (fx_rate is null or fx_rate > 0),
  account_id uuid references public.accounts(id) on delete set null,
  transaction_id uuid references public.transactions(id) on delete set null,
  note text,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists holding_trades_holding_idx on public.holding_trades (holding_id, trade_date);

create table if not exists public.holding_prices (
  holding_id uuid not null references public.holdings(id) on delete cascade,
  price_date date not null,
  price_cop numeric not null check (price_cop >= 0),
  primary key (holding_id, price_date)
);

create table if not exists public.investment_settings (
  household_id uuid primary key references public.households(id) on delete cascade,
  fx_source text not null default 'trm' check (fx_source in ('trm', 'wenia')),
  wenia_buy numeric check (wenia_buy is null or wenia_buy > 0),
  wenia_sell numeric check (wenia_sell is null or wenia_sell > 0),
  fx_alert boolean not null default false
);

-- un aviso de dólar por hogar y día (lo escribe el cron)
create table if not exists public.fx_alert_log (
  household_id uuid not null references public.households(id) on delete cascade,
  alert_date date not null,
  primary key (household_id, alert_date)
);

alter table public.holdings enable row level security;
alter table public.holding_trades enable row level security;
alter table public.holding_prices enable row level security;
alter table public.investment_settings enable row level security;
alter table public.fx_alert_log enable row level security;

drop policy if exists "ver posiciones" on public.holdings;
create policy "ver posiciones" on public.holdings for select using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid()));
drop policy if exists "crear posiciones" on public.holdings;
create policy "crear posiciones" on public.holdings for insert with check (
  public.is_household_member(household_id) and created_by = auth.uid() and (owner_member_id is null or owner_member_id = auth.uid()));
drop policy if exists "editar posiciones" on public.holdings;
create policy "editar posiciones" on public.holdings for update
  using (public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid()))
  with check (public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid()));
drop policy if exists "borrar posiciones" on public.holdings;
create policy "borrar posiciones" on public.holdings for delete using (
  public.is_household_member(household_id) and (owner_member_id is null or owner_member_id = auth.uid()));

-- operaciones y precios siguen la visibilidad de su posición (la subconsulta pasa por "ver posiciones")
drop policy if exists "ver operaciones" on public.holding_trades;
create policy "ver operaciones" on public.holding_trades for select using (
  exists (select 1 from public.holdings h where h.id = holding_trades.holding_id));
drop policy if exists "crear operaciones" on public.holding_trades;
create policy "crear operaciones" on public.holding_trades for insert with check (
  created_by = auth.uid()
  and exists (select 1 from public.holdings h where h.id = holding_trades.holding_id and h.household_id = holding_trades.household_id));
drop policy if exists "borrar operaciones" on public.holding_trades;
create policy "borrar operaciones" on public.holding_trades for delete using (
  exists (select 1 from public.holdings h where h.id = holding_trades.holding_id));

drop policy if exists "ver precios" on public.holding_prices;
create policy "ver precios" on public.holding_prices for select using (
  exists (select 1 from public.holdings h where h.id = holding_prices.holding_id));
drop policy if exists "guardar precios" on public.holding_prices;
create policy "guardar precios" on public.holding_prices for insert with check (
  exists (select 1 from public.holdings h where h.id = holding_prices.holding_id));
drop policy if exists "actualizar precios" on public.holding_prices;
create policy "actualizar precios" on public.holding_prices for update
  using (exists (select 1 from public.holdings h where h.id = holding_prices.holding_id))
  with check (exists (select 1 from public.holdings h where h.id = holding_prices.holding_id));

drop policy if exists "ver ajustes de inversión" on public.investment_settings;
create policy "ver ajustes de inversión" on public.investment_settings for select using (public.is_household_member(household_id));
drop policy if exists "crear ajustes de inversión" on public.investment_settings;
create policy "crear ajustes de inversión" on public.investment_settings for insert with check (public.is_household_member(household_id));
drop policy if exists "editar ajustes de inversión" on public.investment_settings;
create policy "editar ajustes de inversión" on public.investment_settings for update
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
-- fx_alert_log: sin políticas para personas (solo el service role del cron)

-- No se vende más de lo que se tiene, ni se borra una compra de la que ya se vendió (el orden por fechas lo cuida la app).
create or replace function public.guard_holding_units()
returns trigger language plpgsql set search_path = public as $$
declare held numeric;
begin
  if tg_op = 'INSERT' and new.side = 'venta' then
    select coalesce(sum(case when side = 'compra' then units else -units end), 0) into held from holding_trades where holding_id = new.holding_id;
    if new.units > held + 0.00000001 then raise exception 'No puedes vender más de lo que tienes (%)', held; end if;
  elsif tg_op = 'DELETE' and old.side = 'compra' and exists (select 1 from holdings where id = old.holding_id) then
    select coalesce(sum(case when side = 'compra' then units else -units end), 0) into held from holding_trades where holding_id = old.holding_id and id <> old.id;
    if held < -0.00000001 then raise exception 'Esa compra ya respalda ventas posteriores: borra primero esas ventas'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists guard_holding_units on public.holding_trades;
create trigger guard_holding_units before insert or delete on public.holding_trades for each row execute function public.guard_holding_units();
revoke execute on function public.guard_holding_units() from public, anon, authenticated;
