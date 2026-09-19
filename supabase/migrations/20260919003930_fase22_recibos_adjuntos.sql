-- Fase 22: adjuntar el recibo (foto o PDF) a un movimiento.
-- Los archivos van a un bucket PRIVADO de Supabase Storage ("receipts"), en la ruta
--   <household_id>/<transaction_id>/<archivo>
-- y cada archivo tiene una fila en transaction_attachments. Quien puede ver el movimiento
-- (las políticas RLS de transactions ya distinguen lo privado de lo compartido) puede ver y
-- agregar recibos; los archivos solo se leen con URL firmada temporal.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

create table if not exists transaction_attachments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  path text not null unique,
  mime text not null,
  size_bytes int,
  file_name text,
  created_by uuid not null default auth.uid() references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists transaction_attachments_tx_idx on transaction_attachments (transaction_id);
create index if not exists transaction_attachments_household_idx on transaction_attachments (household_id);
alter table transaction_attachments enable row level security;

-- la subconsulta a transactions ya pasa por "ver movimientos": solo si puedes ver el movimiento
drop policy if exists "ver recibos" on transaction_attachments;
create policy "ver recibos" on transaction_attachments for select using (
  public.is_household_member(household_id)
  and exists (select 1 from transactions t where t.id = transaction_attachments.transaction_id)
);
drop policy if exists "agregar recibos" on transaction_attachments;
create policy "agregar recibos" on transaction_attachments for insert with check (
  public.is_household_member(household_id)
  and created_by = auth.uid()
  and exists (select 1 from transactions t where t.id = transaction_attachments.transaction_id and t.household_id = transaction_attachments.household_id)
);
drop policy if exists "borrar recibos" on transaction_attachments;
create policy "borrar recibos" on transaction_attachments for delete using (
  public.is_household_member(household_id)
  and exists (select 1 from transactions t where t.id = transaction_attachments.transaction_id)
);

-- Archivos: la carpeta es <hogar>/<movimiento>; se lee, sube y borra solo dentro de la carpeta de un
-- movimiento del hogar que puedes ver (la subconsulta a transactions pasa por "ver movimientos").
-- Comparaciones como texto: nada se convierte a uuid. (El "leer" no depende de la fila de
-- transaction_attachments porque al subir el archivo esa fila todavía no existe.)
drop policy if exists "leer recibos" on storage.objects;
create policy "leer recibos" on storage.objects for select to authenticated using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.transactions t
    where t.id::text = (storage.foldername(storage.objects.name))[2]
      and t.household_id::text = (storage.foldername(storage.objects.name))[1]
      and public.is_household_member(t.household_id)
  )
);
drop policy if exists "subir recibos" on storage.objects;
create policy "subir recibos" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.transactions t
    where t.id::text = (storage.foldername(storage.objects.name))[2]
      and t.household_id::text = (storage.foldername(storage.objects.name))[1]
      and public.is_household_member(t.household_id)
  )
);
drop policy if exists "borrar recibos (archivos)" on storage.objects;
create policy "borrar recibos (archivos)" on storage.objects for delete to authenticated using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.transactions t
    where t.id::text = (storage.foldername(storage.objects.name))[2]
      and t.household_id::text = (storage.foldername(storage.objects.name))[1]
      and public.is_household_member(t.household_id)
  )
);
