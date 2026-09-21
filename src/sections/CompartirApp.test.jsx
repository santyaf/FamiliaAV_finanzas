// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { CompartirAppCard } from './CompartirApp';

afterEach(() => cleanup());
const URL_APP = 'https://finanzasav.vercel.app';

describe('CompartirAppCard', () => {
  it('usa el menú de compartir del celular con solo el enlace de la app', async () => {
    const share = vi.fn().mockResolvedValue();
    render(<CompartirAppCard url={URL_APP} nav={{ share }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir la app' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: URL_APP, title: 'Finanzas del Hogar' })));
  });
  it('sin menú de compartir copia el enlace', async () => {
    const writeText = vi.fn().mockResolvedValue();
    render(<CompartirAppCard url={URL_APP} nav={{ clipboard: { writeText } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir la app' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(URL_APP)));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Enlace copiado/);
  });
  it('cerrar el menú de compartir no es un error', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    render(<CompartirAppCard url={URL_APP} nav={{ share }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir la app' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('si nada funciona, muestra el enlace para copiarlo a mano', async () => {
    render(<CompartirAppCard url={URL_APP} nav={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir la app' }));
    expect((await screen.findByRole('status')).textContent).toContain(URL_APP);
  });
});
