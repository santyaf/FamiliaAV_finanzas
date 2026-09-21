// Tema claro / oscuro — paletas y aplicación. Los colores de la app (ui/theme.js → T) son variables CSS
// (`var(--t-ink)`…), así que cambiar de tema es solo reescribir esas variables: nada más se vuelve a pintar a mano.

export const PALETTES = {
  light: {
    bg: '#F4F6F2', surface: '#FFFFFF', ink: '#16232E', inkSoft: '#556270', border: '#DEE3DA', track: '#EDEFE9',
    teal: '#256359', tealSoft: '#E1EFEB', coral: '#D35B36', coralSoft: '#FAE7DF', amber: '#B4690E', amberSoft: '#F7EAD4',
    danger: '#B33B33', dangerSoft: '#F8E2DF', focus: '#2F6E68', inverse: '#16232E', onInverse: '#FFFFFF',
  },
  dark: {
    bg: '#0E1620', surface: '#17222D', ink: '#E7EEF3', inkSoft: '#9DAEBC', border: '#2A3946', track: '#2A3946',
    teal: '#3AA08F', tealSoft: '#153531', coral: '#E4693F', coralSoft: '#3A231C', amber: '#E0A24A', amberSoft: '#382D16',
    danger: '#F07A72', dangerSoft: '#3A1E1C', focus: '#5CC2B0', inverse: '#1F3040', onInverse: '#FFFFFF',
  },
};
export const THEME_TOKENS = Object.keys(PALETTES.light);
// con el color claro de respaldo: si las variables aún no se aplicaron, la app se ve igual que siempre
export const cssVar = (token) => `var(--t-${token}, ${PALETTES.light[token]})`;

export const THEME_OPTIONS = [
  { id: 'system', label: 'Igual que el dispositivo' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
];
const KEY = 'fam_theme_v1';

export function readThemePreference(storage) {
  try { const v = storage?.getItem(KEY); return THEME_OPTIONS.some((o) => o.id === v) ? v : 'system'; } catch { return 'system'; }
}
export function saveThemePreference(storage, pref) {
  try { storage.setItem(KEY, pref); } catch { /* sin storage: se aplica igual, pero no se recuerda */ }
}

// 'system' se resuelve con la preferencia del dispositivo.
export function resolveTheme(pref, prefersDark) {
  if (pref === 'light' || pref === 'dark') return pref;
  return prefersDark ? 'dark' : 'light';
}

// Escribe las variables en el elemento raíz, el color del esquema y el de la barra del navegador.
export function applyTheme(resolved, doc = globalThis.document) {
  if (!doc) return resolved;
  const palette = PALETTES[resolved] || PALETTES.light;
  const root = doc.documentElement;
  THEME_TOKENS.forEach((t) => root.style.setProperty(`--t-${t}`, palette[t]));
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;
  if (doc.body) doc.body.style.background = palette.bg;
  const meta = doc.querySelector?.('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? palette.bg : '#2F6E68');
  return resolved;
}

// Arranque: aplica la preferencia guardada y sigue los cambios del dispositivo si está en "system".
export function initTheme({ storage = globalThis.localStorage, win = globalThis.window } = {}) {
  const mql = win?.matchMedia?.('(prefers-color-scheme: dark)');
  const apply = () => applyTheme(resolveTheme(readThemePreference(storage), !!mql?.matches));
  apply();
  mql?.addEventListener?.('change', () => { if (readThemePreference(storage) === 'system') apply(); });
  return apply;
}

export function setTheme(pref, { storage = globalThis.localStorage, win = globalThis.window } = {}) {
  saveThemePreference(storage, pref);
  return applyTheme(resolveTheme(pref, !!win?.matchMedia?.('(prefers-color-scheme: dark)')?.matches));
}
