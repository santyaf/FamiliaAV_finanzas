import { describe, it, expect } from 'vitest';
import { cronStatus, CRON_LATE_MINUTES } from './cronHealth';

const now = new Date('2026-09-21T12:00:00Z');
const at = (min) => new Date(now.getTime() - min * 60000).toISOString();

describe('cronStatus', () => {
  it('sin latido: sin registros', () => {
    expect(cronStatus(null, now).state).toBe('never');
    expect(cronStatus({}, now).state).toBe('never');
  });
  it('una ejecución reciente está al día', () => {
    const s = cronStatus({ lastRunAt: at(3), lastOk: true, sent: 2 }, now);
    expect(s.state).toBe('ok');
    expect(s.label).toContain('hace 3 min');
    expect(s.detail).toContain('2 avisos enviados');
  });
  it('singular y sin avisos', () => {
    expect(cronStatus({ lastRunAt: at(1), lastOk: true, sent: 1 }, now).detail).toContain('1 aviso enviado.');
    expect(cronStatus({ lastRunAt: at(0), lastOk: true, sent: 0 }, now).label).toContain('hace instantes');
  });
  it('pasado el margen se considera detenido, aunque la última haya salido bien', () => {
    const s = cronStatus({ lastRunAt: at(CRON_LATE_MINUTES + 1), lastOk: true }, now);
    expect(s.state).toBe('late');
    expect(s.tone).toBe('bad');
  });
  it('en el límite exacto todavía está al día', () => {
    expect(cronStatus({ lastRunAt: at(CRON_LATE_MINUTES), lastOk: true }, now).state).toBe('ok');
  });
  it('una ejecución reciente con error se marca con errores y muestra el detalle', () => {
    const s = cronStatus({ lastRunAt: at(4), lastOk: false, detail: 'VAPID inválida' }, now);
    expect(s.state).toBe('failing');
    expect(s.detail).toBe('VAPID inválida');
  });
  it('expresa horas y días', () => {
    expect(cronStatus({ lastRunAt: at(180), lastOk: true }, now).label).toContain('hace 3 h');
    expect(cronStatus({ lastRunAt: at(3000), lastOk: true }, now).label).toContain('hace 2 d');
  });
});
