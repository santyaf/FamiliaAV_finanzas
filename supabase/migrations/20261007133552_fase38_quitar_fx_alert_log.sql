-- El aviso del dólar usa la tabla de notificaciones (clave anti-duplicado por persona, posición y día),
-- así que la tabla fx_alert_log de la fase 37 no hace falta.
drop table if exists public.fx_alert_log;
