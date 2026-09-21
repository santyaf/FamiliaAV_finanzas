import { describe, it, expect } from 'vitest';
import { onboardingSteps, onboardingProgress } from './onboarding';

const empty = { accounts: [], transactions: [], budgets: [], goals: [], members: [{ id: 'm1' }] };

describe('onboardingSteps', () => {
  it('un hogar nuevo tiene los cinco pasos por hacer', () => {
    const steps = onboardingSteps(empty);
    expect(steps.map((s) => s.id)).toEqual(['cuenta', 'movimiento', 'presupuesto', 'objetivo', 'familia']);
    expect(steps.every((s) => !s.done)).toBe(true);
  });
  it('cada paso se marca solo cuando los datos lo cumplen', () => {
    const steps = onboardingSteps({
      accounts: [{ id: 'a' }], transactions: [{ type: 'expense' }], budgets: [{ id: 'b' }], goals: [], members: [{ id: 'm1' }, { id: 'm2' }],
    });
    expect(Object.fromEntries(steps.map((s) => [s.id, s.done]))).toEqual({ cuenta: true, movimiento: true, presupuesto: true, objetivo: false, familia: true });
  });
  it('las transferencias y conciliaciones no cuentan como "primer movimiento"', () => {
    const steps = onboardingSteps({ ...empty, transactions: [{ type: 'transfer' }, { type: 'settlement' }] });
    expect(steps.find((s) => s.id === 'movimiento').done).toBe(false);
  });
  it('cada paso pendiente sabe a dónde llevar', () => {
    onboardingSteps(empty).forEach((s) => expect(s.cta.modal || s.cta.tab).toBeTruthy());
  });
});

describe('onboardingProgress', () => {
  it('cuenta avance, siguiente paso y si terminó', () => {
    const steps = onboardingSteps({ ...empty, accounts: [{ id: 'a' }] });
    expect(onboardingProgress(steps)).toMatchObject({ done: 1, total: 5, pct: 20, complete: false });
    expect(onboardingProgress(steps).next.id).toBe('movimiento');
    const all = onboardingSteps({ accounts: [{}], transactions: [{ type: 'income' }], budgets: [{}], goals: [{}], members: [{}, {}] });
    expect(onboardingProgress(all)).toMatchObject({ pct: 100, complete: true, next: null });
  });
});
