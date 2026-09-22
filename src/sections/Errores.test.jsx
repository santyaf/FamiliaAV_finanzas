// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
import { ErroresCard } from './AdminPanel';

afterEach(() => cleanup());
const rows = [
  { id: '1', userId: 'u1', message: 'Cannot read properties of undefined', stack: 'at Foo (a.js:1)', source: 'window', route: '#/creditos', createdAt: '2026-09-21T10:00:00Z' },
  { id: '2', userId: 'u2', message: 'Cannot read properties of undefined', stack: 'at Foo (a.js:1)', source: 'window', route: '#/creditos', createdAt: '2026-09-21T11:00:00Z' },
];

describe('ErroresCard', () => {
  it('agrupa, muestra cuántas veces y a cuántas personas, y despliega el stack', async () => {
    render(<ErroresCard actions={{ loadClientErrors: vi.fn().mockResolvedValue(rows), clearClientErrors: vi.fn() }} />);
    expect(await screen.findByText('Cannot read properties of undefined')).toBeTruthy();
    expect(screen.getByText(/2 veces · 2 personas/)).toBeTruthy();
    fireEvent.click(screen.getByText('Cannot read properties of undefined'));
    expect(screen.getByText('at Foo (a.js:1)')).toBeTruthy();
  });
  it('sin errores lo dice', async () => {
    render(<ErroresCard actions={{ loadClientErrors: vi.fn().mockResolvedValue([]), clearClientErrors: vi.fn() }} />);
    expect(await screen.findByText(/Sin errores reportados/)).toBeTruthy();
  });
  it('borrar pide confirmación y vuelve a cargar', async () => {
    const actions = { loadClientErrors: vi.fn().mockResolvedValueOnce(rows).mockResolvedValue([]), clearClientErrors: vi.fn().mockResolvedValue() };
    vi.stubGlobal('confirm', () => true);
    render(<ErroresCard actions={actions} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar reportes de error' }));
    await waitFor(() => expect(actions.clearClientErrors).toHaveBeenCalled());
    expect(await screen.findByText(/Sin errores reportados/)).toBeTruthy();
    vi.unstubAllGlobals();
  });
  it('si no puede leer, muestra el error', async () => {
    render(<ErroresCard actions={{ loadClientErrors: vi.fn().mockRejectedValue(new Error('sin permiso')), clearClientErrors: vi.fn() }} />);
    expect((await screen.findByRole('alert')).textContent).toBe('sin permiso');
  });
});
