// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MfaCard, MfaChallengeScreen } from './Mfa';

// auth.jsx importa el cliente de Supabase, que exige variables de entorno
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));

afterEach(() => cleanup());

const mkApi = (over = {}) => ({
  listFactors: vi.fn().mockResolvedValue([]),
  enroll: vi.fn().mockResolvedValue({ id: 'f1', qr: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABCD EFGH' }),
  verifyEnroll: vi.fn().mockResolvedValue(),
  unenroll: vi.fn().mockResolvedValue(),
  ...over,
});

describe('MfaCard', () => {
  it('activar: muestra el QR y la clave, y pide el código de 6 números', async () => {
    const api = mkApi();
    render(<MfaCard api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activar verificación en dos pasos' }));
    expect(await screen.findByAltText('Código QR para la app autenticadora')).toBeTruthy();
    expect(screen.getByText('ABCD EFGH')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Código de verificación'), { target: { value: '12ab34' } });
    expect(screen.getByLabelText('Código de verificación').value).toBe('1234'); // solo números
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    expect(screen.getByText('El código tiene 6 números.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Código de verificación'), { target: { value: '123456' } });
    api.listFactors.mockResolvedValue([{ id: 'f1', status: 'verified' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    await waitFor(() => expect(api.verifyEnroll).toHaveBeenCalledWith('f1', '123456'));
    expect(await screen.findByText(/Activada/)).toBeTruthy();
  });

  it('un código incorrecto muestra un mensaje claro y deja reintentar', async () => {
    const api = mkApi({ verifyEnroll: vi.fn().mockRejectedValue(new Error('Invalid TOTP code entered')) });
    render(<MfaCard api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activar verificación en dos pasos' }));
    await screen.findByAltText('Código QR para la app autenticadora');
    fireEvent.change(screen.getByLabelText('Código de verificación'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    expect(await screen.findByText(/no es correcto o ya venció/)).toBeTruthy();
  });

  it('cancelar la activación descarta el factor a medias', async () => {
    const api = mkApi();
    render(<MfaCard api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activar verificación en dos pasos' }));
    await screen.findByAltText('Código QR para la app autenticadora');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(api.unenroll).toHaveBeenCalledWith('f1'));
    expect(screen.getByRole('button', { name: 'Activar verificación en dos pasos' })).toBeTruthy();
  });

  it('con el factor activo se puede desactivar tras confirmar', async () => {
    const api = mkApi({ listFactors: vi.fn().mockResolvedValue([{ id: 'f9', status: 'verified' }]) });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MfaCard api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(api.unenroll).toHaveBeenCalledWith('f9'));
  });

  it('si la verificación está deshabilitada en el servidor lo explica', async () => {
    const api = mkApi({ enroll: vi.fn().mockRejectedValue(new Error('MFA enroll is disabled for TOTP')) });
    render(<MfaCard api={api} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activar verificación en dos pasos' }));
    expect(await screen.findByText(/no está habilitada en el servidor/)).toBeTruthy();
  });
});

describe('MfaChallengeScreen', () => {
  it('envía el código de 6 números y muestra el error si falla', async () => {
    const onVerify = vi.fn().mockRejectedValueOnce(new Error('invalid code')).mockResolvedValueOnce();
    render(<MfaChallengeScreen onVerify={onVerify} onSignOut={() => {}} />);
    fireEvent.change(screen.getByLabelText('Código de verificación'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(onVerify).not.toHaveBeenCalled(); // incompleto
    fireEvent.change(screen.getByLabelText('Código de verificación'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Código de verificación'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(onVerify).toHaveBeenLastCalledWith('654321'));
  });
  it('permite cerrar sesión', () => {
    const onSignOut = vi.fn();
    render(<MfaChallengeScreen onVerify={vi.fn()} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
