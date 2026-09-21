// @vitest-environment jsdom
import React, { Suspense } from 'react';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { LazyBoundary, lazyNamed, isChunkLoadError } from './LazyBoundary';

afterEach(() => cleanup());
beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('isChunkLoadError', () => {
  it('reconoce los errores de carga de módulos de distintos navegadores', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 12 failed'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('otro error'))).toBe(false);
  });
});

describe('lazyNamed', () => {
  it('carga un export con nombre bajo demanda', async () => {
    const Lazy = lazyNamed(() => Promise.resolve({ Hola: () => <p>hola mundo</p> }), 'Hola');
    render(<LazyBoundary><Suspense fallback={<p>cargando</p>}><Lazy /></Suspense></LazyBoundary>);
    expect(screen.getByText('cargando')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('hola mundo')).toBeTruthy());
  });
});

describe('LazyBoundary', () => {
  it('si falla un archivo de un despliegue viejo, se recarga sola una vez', async () => {
    sessionStorage.clear();
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });
    const Broken = lazyNamed(() => Promise.reject(new Error('Failed to fetch dynamically imported module')), 'X');
    render(<LazyBoundary><Suspense fallback={null}><Broken /></Suspense></LazyBoundary>);
    await waitFor(() => expect(screen.getByText(/versión nueva/)).toBeTruthy());
    expect(reload).toHaveBeenCalledTimes(1);
    cleanup();
    render(<LazyBoundary><Suspense fallback={null}><Broken /></Suspense></LazyBoundary>);
    await waitFor(() => expect(screen.getByText(/versión nueva/)).toBeTruthy());
    expect(reload).toHaveBeenCalledTimes(1); // no en bucle
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeTruthy();
  });
  it('otro error muestra un mensaje y no recarga', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, writable: true });
    const Boom = () => { throw new Error('boom'); };
    render(<LazyBoundary><Boom /></LazyBoundary>);
    expect(screen.getByText('No se pudo cargar esta pantalla.')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });
});
