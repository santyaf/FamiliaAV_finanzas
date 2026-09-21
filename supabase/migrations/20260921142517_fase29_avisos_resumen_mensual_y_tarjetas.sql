-- Fase 29: avisos programados del servidor (api/send-reminders.js).
--  - digest_sent_log: un resumen mensual ("Cerró septiembre: revisa la reunión mensual") por persona y mes.
--  - card_alert_log: un aviso de vencimiento de pago por tarjeta y fecha (desde 2 días antes).
-- Sin políticas: solo las toca la función del servidor con la llave de servicio.

create table if not exists digest_sent_log (
  user_id uuid not null references profiles(id) on delete cascade,
  month_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, month_key)
);
alter table digest_sent_log enable row level security;

create table if not exists card_alert_log (
  account_id uuid not null references accounts(id) on delete cascade,
  due_date date not null,
  sent_at timestamptz not null default now(),
  primary key (account_id, due_date)
);
alter table card_alert_log enable row level security;
