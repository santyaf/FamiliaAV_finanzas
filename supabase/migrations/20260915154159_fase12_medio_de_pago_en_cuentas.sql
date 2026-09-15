-- =========================================================
-- FASE 12 — MEDIO DE PAGO EN CUENTAS
-- =========================================================
-- Permite marcar cada cuenta como efectivo, tarjeta débito, cuenta de
-- ahorros o tarjeta de crédito, para poder ver cuánto hay disponible (o
-- gastado, en el caso de la tarjeta de crédito) por cada medio de pago.
-- Sin cupo/límite para tarjeta de crédito por ahora — es solo informativa.
-- =========================================================

alter table accounts
  add column if not exists payment_kind text
  check (payment_kind in ('efectivo','debito','ahorros','tarjeta_credito','otro'))
  not null default 'otro';
