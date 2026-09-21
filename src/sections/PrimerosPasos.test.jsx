// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PrimerosPasos } from './PrimerosPasos';

beforeEach(() => { try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => cleanup());

const empty = { accounts: [], transactions: [], budgets: [], goals: [], members: [{ id: 'm1' }] };

describe('PrimerosPasos', () => {
  it('muestra los pasos pendientes con su botón y lleva a donde toca', () => {
    const setModal = vi.fn(); const setTab = vi.fn();
    render(<PrimerosPasos data={empty} householdId="h1" setModal={setModal} setTab={setTab} />);
    expect(screen.getByText('0 de 5 listos', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(setModal).toHaveBeenCalledWith({ type: 'account' });
    fireEvent.click(screen.getByRole('button', { name: 'Crear presupuesto' }));
    expect(setTab).toHaveBeenCalledWith('presupuestos');
  });
  it('un paso cumplido se tacha y ya no tiene botón', () => {
    render(<PrimerosPasos data={{ ...empty, accounts: [{ id: 'a' }] }} householdId="h1" setModal={() => {}} setTab={() => {}} />);
    expect(screen.getByText('1 de 5 listos', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Crear cuenta' })).toBeNull();
  });
  it('se puede ocultar y no vuelve a aparecer en ese hogar', () => {
    const { unmount } = render(<PrimerosPasos data={empty} householdId="h1" setModal={() => {}} setTab={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar primeros pasos' }));
    expect(screen.queryByText('Primeros pasos')).toBeNull();
    unmount();
    render(<PrimerosPasos data={empty} householdId="h1" setModal={() => {}} setTab={() => {}} />);
    expect(screen.queryByText('Primeros pasos')).toBeNull();
    cleanup();
    render(<PrimerosPasos data={empty} householdId="otro" setModal={() => {}} setTab={() => {}} />);
    expect(screen.getByText('Primeros pasos')).toBeTruthy(); // otro hogar
  });
  it('al completar todo desaparece sola', () => {
    const done = { accounts: [{}], transactions: [{ type: 'expense' }], budgets: [{}], goals: [{}], members: [{}, {}] };
    const { container } = render(<PrimerosPasos data={done} householdId="h1" setModal={() => {}} setTab={() => {}} />);
    expect(container.textContent).toBe('');
  });
});
