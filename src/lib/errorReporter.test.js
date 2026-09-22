// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { normalizeError, isNoise, shouldReport, installErrorReporter, groupErrors, reportBoundaryError, MAX_PER_SESSION } from './errorReporter';

const state = () => ({ seen: new Set(), count: 0 });

// los ErrorEvent que se lanzan a mano no deben contarse como errores sin atender de la prueba
window.addEventListener('error', (e) => e.preventDefault());

describe('normalizeError', () => {
  it('toma mensaje y un fragmento del stack de un Error', () => {
    const e = new Error('boom'); e.stack = ['Error: boom', ...Array.from({ length: 20 }, (_, i) => `  at f${i}`)].join('\n');
    const n = normalizeError(e);
    expect(n.message).toBe('boom');
    expect(n.stack.split('\n')).toHaveLength(8);
  });
  it('entiende los eventos de error y de promesa rechazada', () => {
    expect(normalizeError({ error: new Error('desde window') }).message).toBe('desde window');
    expect(normalizeError({ reason: new Error('promesa') }).message).toBe('promesa');
    expect(normalizeError({ reason: 'texto suelto' }).message).toBe('texto suelto');
    expect(normalizeError(undefined).message).toBe('Error desconocido');
  });
  it('recorta mensajes larguísimos', () => { expect(normalizeError(new Error('x'.repeat(2000))).message).toHaveLength(500); });
});

describe('shouldReport', () => {
  it('ignora el ruido del navegador y de las redes', () => {
    ['ResizeObserver loop limit exceeded', 'Script error.', 'TypeError: Failed to fetch', 'Load failed', 'The operation was aborted', '[object Event]']
      .forEach((m) => expect(isNoise(m)).toBe(true));
    expect(isNoise('Cannot read properties of undefined (reading id)')).toBe(false);
    expect(isNoise('x', 'at chrome-extension://abc/content.js')).toBe(true);
  });
  it('no repite el mismo error en la sesión', () => {
    const s = state();
    expect(shouldReport(s, { message: 'A' })).toBe(true);
    expect(shouldReport(s, { message: 'A' })).toBe(false);
    expect(shouldReport(s, { message: 'B' })).toBe(true);
  });
  it('tiene un tope por sesión', () => {
    const s = state();
    const results = Array.from({ length: MAX_PER_SESSION + 3 }, (_, i) => shouldReport(s, { message: `err ${i}` }));
    expect(results.filter(Boolean)).toHaveLength(MAX_PER_SESSION);
  });
});

describe('installErrorReporter', () => {
  it('reporta errores y promesas rechazadas con la pantalla y el navegador, y deja de hacerlo al desinstalar', () => {
    const report = vi.fn().mockResolvedValue();
    const reporter = installErrorReporter({ report });
    window.location.hash = '#/creditos';
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('falló A') }));
    const rejection = new Event('unhandledrejection'); rejection.reason = new Error('falló B');
    window.dispatchEvent(rejection);
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[0][0]).toMatchObject({ message: 'falló A', source: 'window', route: '#/creditos' });
    expect(report.mock.calls[1][0]).toMatchObject({ message: 'falló B', source: 'promise' });
    reporter.uninstall();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('falló C') }));
    expect(report).toHaveBeenCalledTimes(2);
  });
  it('el ErrorBoundary reporta mientras hay un reportero instalado', () => {
    const report = vi.fn().mockResolvedValue();
    const reporter = installErrorReporter({ report });
    reportBoundaryError(new Error('render roto'));
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'render roto', source: 'boundary' }));
    reporter.uninstall();
    reportBoundaryError(new Error('otro'));
    expect(report).toHaveBeenCalledTimes(1);
  });
  it('si el reporte falla, la app no se entera', () => {
    const report = vi.fn().mockRejectedValue(new Error('sin red'));
    const reporter = installErrorReporter({ report });
    expect(() => window.dispatchEvent(new ErrorEvent('error', { error: new Error('x1') }))).not.toThrow();
    const sync = vi.fn(() => { throw new Error('síncrono'); });
    const r2 = installErrorReporter({ report: sync });
    expect(() => window.dispatchEvent(new ErrorEvent('error', { error: new Error('x2') }))).not.toThrow();
    reporter.uninstall(); r2.uninstall();
  });
});

describe('groupErrors', () => {
  it('agrupa por mensaje con conteo, personas y la última vez', () => {
    const rows = [
      { message: 'A', userId: 'u1', createdAt: '2026-09-20T10:00:00Z', route: '#/a' },
      { message: 'A', userId: 'u2', createdAt: '2026-09-21T10:00:00Z', route: '#/b' },
      { message: 'A', userId: 'u2', createdAt: '2026-09-19T10:00:00Z', route: '#/c' },
      { message: 'B', userId: 'u1', createdAt: '2026-09-22T10:00:00Z', route: '#/z' },
    ];
    const g = groupErrors(rows);
    expect(g.map((x) => x.message)).toEqual(['B', 'A']);
    expect(g[1]).toMatchObject({ count: 3, users: 2, last: '2026-09-21T10:00:00Z', route: '#/b' });
    expect(groupErrors(undefined)).toEqual([]);
  });
});
