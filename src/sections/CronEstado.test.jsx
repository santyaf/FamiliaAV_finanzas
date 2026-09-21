// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
import { CronEstadoCard } from './AdminPanel';

afterEach(() => cleanup());
const now = new Date('2026-09-21T12:00:00Z');

describe('CronEstadoCard', () => {
  it('muestra que el cron está al día', async () => {
    const actions = { loadCronHeartbeat: vi.fn().mockResolvedValue({ lastRunAt: '2026-09-21T11:57:00Z', lastOk: true, sent: 0 }) };
    render(<CronEstadoCard actions={actions} now={now} />);
    await waitFor(() => expect(screen.getByText('Al día · hace 3 min')).toBeTruthy());
  });
  it('avisa cuando el cron se detuvo', async () => {
    const actions = { loadCronHeartbeat: vi.fn().mockResolvedValue({ lastRunAt: '2026-09-21T09:00:00Z', lastOk: true, sent: 0 }) };
    render(<CronEstadoCard actions={actions} now={now} />);
    await waitFor(() => expect(screen.getByText(/Detenido · última ejecución hace 3 h/)).toBeTruthy());
    expect(screen.getByText(/cron-job.org/)).toBeTruthy();
  });
  it('sin registros lo dice, y actualizar vuelve a consultar', async () => {
    const actions = { loadCronHeartbeat: vi.fn().mockResolvedValue(null) };
    render(<CronEstadoCard actions={actions} now={now} />);
    await waitFor(() => expect(screen.getByText('Sin registros')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado' }));
    await waitFor(() => expect(actions.loadCronHeartbeat).toHaveBeenCalledTimes(2));
  });
  it('si la consulta falla muestra el error', async () => {
    const actions = { loadCronHeartbeat: vi.fn().mockRejectedValue(new Error('sin permiso')) };
    render(<CronEstadoCard actions={actions} now={now} />);
    await waitFor(() => expect(screen.getByText('sin permiso')).toBeTruthy());
  });
});
