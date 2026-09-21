// Estado del cron de recordatorios a partir de su latido (tabla cron_heartbeat).
// El cron externo corre cada 5 minutos: pasado este margen sin latido, algo se detuvo.
export const CRON_EXPECTED_MINUTES = 5;
export const CRON_LATE_MINUTES = 30;

export function cronStatus(row, now = new Date()) {
  if (!row?.lastRunAt) {
    return { state: 'never', tone: 'warn', label: 'Sin registros', detail: 'El cron todavía no ha llamado a /api/send-reminders (o la migración recién se aplicó).' };
  }
  const minutes = Math.max(0, Math.round((new Date(now).getTime() - new Date(row.lastRunAt).getTime()) / 60000));
  const ago = minutes < 1 ? 'hace instantes' : minutes < 60 ? `hace ${minutes} min` : minutes < 1440 ? `hace ${Math.floor(minutes / 60)} h` : `hace ${Math.floor(minutes / 1440)} d`;
  if (minutes > CRON_LATE_MINUTES) {
    return { state: 'late', tone: 'bad', minutes, label: `Detenido · última ejecución ${ago}`, detail: `Debería correr cada ${CRON_EXPECTED_MINUTES} minutos. Revisa el trabajo en cron-job.org y REMINDER_CRON_SECRET en Vercel.` };
  }
  if (row.lastOk === false) {
    return { state: 'failing', tone: 'bad', minutes, label: `Con errores · ${ago}`, detail: row.detail || 'La última ejecución terminó con error.' };
  }
  return { state: 'ok', tone: 'good', minutes, label: `Al día · ${ago}`, detail: row.sent ? `Última ejecución: ${row.sent} aviso${row.sent === 1 ? '' : 's'} enviado${row.sent === 1 ? '' : 's'}.` : 'Última ejecución sin avisos pendientes.' };
}
