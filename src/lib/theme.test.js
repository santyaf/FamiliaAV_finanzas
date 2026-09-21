// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PALETTES, THEME_TOKENS, cssVar, resolveTheme, readThemePreference, saveThemePreference, applyTheme, initTheme, setTheme,
} from './theme';
import { T } from '../ui/theme';

// contraste WCAG entre dos colores hex
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

beforeEach(() => { document.documentElement.removeAttribute('style'); document.documentElement.removeAttribute('data-theme'); document.body.removeAttribute('style'); });

describe('paletas', () => {
  it('claro y oscuro definen exactamente los mismos colores, todos en hexadecimal', () => {
    expect(Object.keys(PALETTES.dark).sort()).toEqual(Object.keys(PALETTES.light).sort());
    THEME_TOKENS.forEach((t) => { expect(PALETTES.light[t]).toMatch(/^#[0-9A-F]{6}$/i); expect(PALETTES.dark[t]).toMatch(/^#[0-9A-F]{6}$/i); });
  });
  it.each(['light', 'dark'])('%s: el texto se lee (contraste WCAG AA, 4.5:1) sobre el fondo y las tarjetas', (mode) => {
    const p = PALETTES[mode];
    expect(contrast(p.ink, p.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(p.ink, p.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(p.inkSoft, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.inkSoft, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.teal, p.surface)).toBeGreaterThanOrEqual(4.5); // enlaces y cifras en verde
    expect(contrast(p.coral, p.surface)).toBeGreaterThanOrEqual(3); // gastos (texto grande / cifras en negrita)
    expect(contrast(p.danger, p.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.onInverse, p.inverse)).toBeGreaterThanOrEqual(7); // tarjetas de patrimonio
  });
  it.each(['light', 'dark'])('%s: texto blanco sobre los botones de color (verde y coral) alcanza el mínimo de texto grande (3:1)', (mode) => {
    const p = PALETTES[mode];
    expect(contrast('#FFFFFF', p.teal)).toBeGreaterThanOrEqual(3);
    expect(contrast('#FFFFFF', p.coral)).toBeGreaterThanOrEqual(3);
  });
  it('los textos sobre sus fondos suaves también se leen', () => {
    ['light', 'dark'].forEach((mode) => {
      const p = PALETTES[mode];
      expect(contrast(p.teal, p.tealSoft)).toBeGreaterThanOrEqual(3.5);
      expect(contrast(p.ink, p.tealSoft)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.ink, p.coralSoft)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.ink, p.amberSoft)).toBeGreaterThanOrEqual(7);
    });
  });
});

describe('T (tokens de la app)', () => {
  it('son variables CSS con el color claro de respaldo', () => {
    expect(T.ink).toBe(`var(--t-ink, ${PALETTES.light.ink})`);
    expect(cssVar('bg')).toBe(`var(--t-bg, ${PALETTES.light.bg})`);
    expect(T.gold).toBe(T.amber); // alias de compatibilidad
  });
  it('tienen todos los tokens de la paleta', () => {
    THEME_TOKENS.forEach((t) => expect(T[t]).toContain(`--t-${t}`));
  });
});

describe('preferencia y aplicación', () => {
  it('"sistema" sigue al dispositivo; claro y oscuro mandan', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
  it('lee y guarda la preferencia; un valor raro vuelve a "system"', () => {
    const st = memoryStorage();
    expect(readThemePreference(st)).toBe('system');
    saveThemePreference(st, 'dark');
    expect(readThemePreference(st)).toBe('dark');
    st.setItem('fam_theme_v1', 'azul');
    expect(readThemePreference(st)).toBe('system');
    expect(readThemePreference(undefined)).toBe('system');
  });
  it('aplicar escribe las variables, el esquema de color y el atributo', () => {
    applyTheme('dark');
    expect(document.documentElement.style.getPropertyValue('--t-bg')).toBe(PALETTES.dark.bg);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.style.getPropertyValue('--t-bg')).toBe(PALETTES.light.bg);
  });
  it('setTheme guarda y aplica; initTheme aplica lo guardado', () => {
    const st = memoryStorage();
    const win = { matchMedia: () => ({ matches: false, addEventListener: () => {} }) };
    setTheme('dark', { storage: st, win });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    initTheme({ storage: st, win });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
  it('en "system" reacciona cuando el dispositivo cambia de tema', () => {
    const st = memoryStorage();
    let listener; const mql = { matches: false, addEventListener: (_, fn) => { listener = fn; } };
    initTheme({ storage: st, win: { matchMedia: () => mql } });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    mql.matches = true; listener();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
