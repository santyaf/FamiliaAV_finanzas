-- =========================================================
-- FASE 13 — CONTROL DE ACCESO POR FUNCIÓN DE IA
-- =========================================================
-- Cada función de IA (Registro rápido, Asistente financiero) puede estar
-- activada para todos ('all'), para nadie ('none'), o para una lista
-- específica de personas ('selected' + userIds) — útil para probar con un
-- grupo chico antes de activarla para toda la plataforma.
-- Reemplaza el booleano quick_capture_enabled (se deja la fila vieja sin
-- usar, sin borrarla, por si algo la referencia todavía).
-- =========================================================

insert into app_settings (key, value) values
  ('quick_capture_access', '{"mode":"all","userIds":[]}'::jsonb),
  ('assistant_access', '{"mode":"none","userIds":[]}'::jsonb)
on conflict (key) do nothing;
