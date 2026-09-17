-- =========================================================
-- FASE 12 — MEDIO DE PAGO POR TRANSACCIÓN
-- =========================================================
-- El medio de pago de una cuenta (Fase 12 anterior) es solo un valor por
-- defecto: en la vida real pagas a veces en efectivo con dinero de una
-- cuenta de ahorros, o viceversa. Cada transacción puede ahora anular ese
-- default. NULL = usa el medio de pago de la cuenta (comportamiento previo).
-- =========================================================

alter table transactions
  add column if not exists payment_kind text
  check (payment_kind in ('efectivo','debito','ahorros','tarjeta_credito','otro'));
