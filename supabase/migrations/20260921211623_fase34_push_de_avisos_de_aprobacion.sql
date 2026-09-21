-- Marca de "ya se envió por push" para los avisos que el cron reenvía al celular (solicitudes de gasto y su decisión).
-- Lo existente se marca como enviado para no mandar un aluvión la primera vez.
alter table public.notifications add column if not exists pushed_at timestamptz;
update public.notifications set pushed_at = now() where pushed_at is null;
create index if not exists notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;
