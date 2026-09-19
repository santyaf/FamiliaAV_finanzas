// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MiCuentaCard, AccountStatusScreen, UsuariosAdmin } from './Usuarios';

// auth.jsx importa el cliente de Supabase, que exige variables de entorno
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));

afterEach(() => cleanup());

const data = { householdName: 'Casa', currency: 'COP', members: [{ id: 'm1', name: 'Ana' }], accounts: [], categories: [], transactions: [], goals: [], budgets: [] };

describe('MiCuentaCard', () => {
  it('desactivar exige escribir DESACTIVAR y luego llama a la acción', async () => {
    const deactivateMyAccount = vi.fn().mockResolvedValue();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });
    render(<MiCuentaCard data={data} actions={{ userId: 'm1', deactivateMyAccount }} />);
    fireEvent.click(screen.getByText('Desactivar mi cuenta'));
    const confirmBtn = screen.getByRole('button', { name: 'Desactivar' });
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Confirmación'), { target: { value: 'desactivar' } });
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(deactivateMyAccount).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('cancelar cierra la confirmación sin llamar a nada', () => {
    const deactivateMyAccount = vi.fn();
    render(<MiCuentaCard data={data} actions={{ userId: 'm1', deactivateMyAccount }} />);
    fireEvent.click(screen.getByText('Desactivar mi cuenta'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Desactivar mi cuenta')).toBeTruthy();
    expect(deactivateMyAccount).not.toHaveBeenCalled();
  });

  it('avisa que no se borra nada', () => {
    render(<MiCuentaCard data={data} actions={{ userId: 'm1' }} />);
    fireEvent.click(screen.getByText('Desactivar mi cuenta'));
    expect(screen.getByText('No se borra nada')).toBeTruthy();
  });
});

describe('AccountStatusScreen', () => {
  it('una cuenta desactivada puede reactivarse', async () => {
    const onReactivate = vi.fn().mockResolvedValue();
    render(<AccountStatusScreen status="deactivated" onReactivate={onReactivate} onSignOut={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar mi cuenta' }));
    await waitFor(() => expect(onReactivate).toHaveBeenCalled());
  });
  it('una cuenta suspendida no ofrece reactivar por sí misma', () => {
    render(<AccountStatusScreen status="suspended" onReactivate={() => {}} onSignOut={() => {}} />);
    expect(screen.getByText('Cuenta suspendida')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reactivar mi cuenta' })).toBeNull();
  });
});

describe('UsuariosAdmin', () => {
  const users = [
    { userId: 'm1', name: 'Yo Admin', email: 'yo@x.co', status: 'active', isAdmin: true, households: 'Casa', lastSeenAt: '2026-09-18T10:00:00Z', createdAt: '2026-08-01T00:00:00Z' },
    { userId: 'm2', name: 'Luis', email: 'luis@x.co', status: 'active', isAdmin: false, households: 'Casa', lastSeenAt: null, createdAt: '2026-08-02T00:00:00Z' },
    { userId: 'm3', name: 'Marta', email: 'marta@x.co', status: 'suspended', isAdmin: false, households: null, lastSeenAt: null, createdAt: '2026-08-03T00:00:00Z' },
  ];
  it('lista usuarios, no ofrece suspenderse a sí mismo y suspende / reactiva a otros', async () => {
    const adminSetUserStatus = vi.fn().mockResolvedValue();
    vi.spyOn(window, 'prompt').mockReturnValue('spam');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UsuariosAdmin actions={{ userId: 'm1', adminListUsers: vi.fn().mockResolvedValue(users), adminSetUserStatus }} />);
    await screen.findByText('Luis');
    expect(screen.getAllByRole('button', { name: /Suspender/ })).toHaveLength(1); // solo Luis
    fireEvent.click(screen.getByRole('button', { name: /Suspender/ }));
    await waitFor(() => expect(adminSetUserStatus).toHaveBeenCalledWith('m2', 'suspended', 'spam'));
    fireEvent.click(screen.getByRole('button', { name: /Reactivar/ }));
    await waitFor(() => expect(adminSetUserStatus).toHaveBeenCalledWith('m3', 'active', null));
  });
});
