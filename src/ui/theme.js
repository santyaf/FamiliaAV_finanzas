// Tokens de diseño y constantes de UI compartidas por toda la app.
// Sin JSX ni componentes — solo valores.

export const T = {
  bg: '#F4F6F2',
  surface: '#FFFFFF',
  ink: '#16232E',
  inkSoft: '#556270',
  border: '#DEE3DA',
  teal: '#256359',
  tealSoft: '#E1EFEB',
  coral: '#D35B36',
  coralSoft: '#FAE7DF',
  amber: '#B4690E',
  amberSoft: '#F7EAD4',
  danger: '#B33B33',
  dangerSoft: '#F8E2DF',
  focus: '#2F6E68',
};
// alias por compatibilidad con nombres usados en todo el código
T.gold = T.amber;
T.goldSoft = T.amberSoft;

export const MEMBER_COLORS = ['#256359', '#D35B36', '#4C6FA0', '#B4690E', '#7E5192', '#3F8C63', '#A1462F', '#375D82'];
export const FONT_DISPLAY = "'Space Grotesk', system-ui, sans-serif";
export const FONT_BODY = "'IBM Plex Sans', system-ui, sans-serif";
export const FONT_MONO = "'IBM Plex Mono', monospace";
export const GOOGLE_FONTS_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');";

// tamaño mínimo de área táctil (accesibilidad — ver auditoría UX)
export const TAP_MIN = 40;

export const STORAGE_KEY = 'hf-data-v1';
export const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const PRIORITY_LABEL = { 3: 'Alta', 2: 'Media', 1: 'Baja' };

export const CURRENCIES = [
  { code: 'USD', label: 'USD - Dólar' },
  { code: 'MXN', label: 'MXN - Peso mexicano' },
  { code: 'COP', label: 'COP - Peso colombiano' },
  { code: 'ARS', label: 'ARS - Peso argentino' },
  { code: 'PEN', label: 'PEN - Sol peruano' },
  { code: 'CLP', label: 'CLP - Peso chileno' },
  { code: 'EUR', label: 'EUR - Euro' },
];

export const DEFAULT_CATEGORIES = [
  { id: 'cat-salario', name: 'Salario', type: 'income', icon: 'briefcase' },
  { id: 'cat-negocio', name: 'Negocio / Freelance', type: 'income', icon: 'receipt' },
  { id: 'cat-rentas', name: 'Rentas', type: 'income', icon: 'home' },
  { id: 'cat-inv-in', name: 'Inversiones', type: 'income', icon: 'trending-up' },
  { id: 'cat-otro-in', name: 'Otros ingresos', type: 'income', icon: 'plus' },
  { id: 'cat-vivienda', name: 'Vivienda', type: 'expense', icon: 'home' },
  { id: 'cat-alimentacion', name: 'Alimentación', type: 'expense', icon: 'utensils' },
  { id: 'cat-transporte', name: 'Transporte', type: 'expense', icon: 'car' },
  { id: 'cat-salud', name: 'Salud', type: 'expense', icon: 'heart-pulse' },
  { id: 'cat-educacion', name: 'Educación', type: 'expense', icon: 'graduation-cap' },
  { id: 'cat-ocio', name: 'Ocio y entretenimiento', type: 'expense', icon: 'film' },
  { id: 'cat-ropa', name: 'Ropa', type: 'expense', icon: 'shirt' },
  { id: 'cat-servicios', name: 'Servicios (luz/agua/internet)', type: 'expense', icon: 'lightbulb' },
  { id: 'cat-deudas', name: 'Deudas y préstamos', type: 'expense', icon: 'credit-card' },
  { id: 'cat-ahorro', name: 'Ahorro / Inversión', type: 'expense', icon: 'piggy-bank' },
  { id: 'cat-otro-ex', name: 'Otros gastos', type: 'expense', icon: 'minus' },
];

export const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.border}`,
  fontFamily: FONT_BODY, fontSize: 15, color: T.ink, background: '#FCFCFA', outline: 'none',
};

export const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
