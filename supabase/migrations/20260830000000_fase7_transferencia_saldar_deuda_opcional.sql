-- =========================================================
-- FASE 7 — transferencia entre integrantes: saldar deuda es opcional
-- =========================================================
alter table transactions add column if not exists settles_debt boolean not null default false;
