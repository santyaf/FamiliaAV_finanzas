import { describe, it, expect } from 'vitest';
import { isAiFeatureEnabled } from './access';

describe('isAiFeatureEnabled', () => {
  it('mode "all": habilitado para cualquier usuario con id', () => {
    expect(isAiFeatureEnabled({ mode: 'all', userIds: [] }, 'u1')).toBe(true);
    expect(isAiFeatureEnabled({ mode: 'all', userIds: ['otro'] }, 'u1')).toBe(true);
  });
  it('mode "none": deshabilitado para todos', () => {
    expect(isAiFeatureEnabled({ mode: 'none', userIds: ['u1'] }, 'u1')).toBe(false);
  });
  it('mode "selected": solo para quienes están en la lista', () => {
    const access = { mode: 'selected', userIds: ['u1', 'u2'] };
    expect(isAiFeatureEnabled(access, 'u1')).toBe(true);
    expect(isAiFeatureEnabled(access, 'u3')).toBe(false);
  });
  it('sin access o sin userId: deshabilitado (no revienta)', () => {
    expect(isAiFeatureEnabled(null, 'u1')).toBe(false);
    expect(isAiFeatureEnabled(undefined, 'u1')).toBe(false);
    expect(isAiFeatureEnabled({ mode: 'all' }, null)).toBe(false);
  });
  it('mode desconocido o userIds ausente en "selected": deshabilitado', () => {
    expect(isAiFeatureEnabled({ mode: 'algo-raro' }, 'u1')).toBe(false);
    expect(isAiFeatureEnabled({ mode: 'selected' }, 'u1')).toBe(false);
  });
});
