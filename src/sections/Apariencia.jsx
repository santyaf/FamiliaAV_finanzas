import React, { useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY } from '../ui/theme';
import { Card } from '../ui/primitives';
import { THEME_OPTIONS, readThemePreference, setTheme } from '../lib/theme';
import { getStorage } from '../lib/safeStorage';

const ICONS = { system: Monitor, light: Sun, dark: Moon };

// Ajustes → Apariencia: claro, oscuro o igual que el dispositivo (se recuerda en este dispositivo).
export function AparienciaCard() {
  const [pref, setPref] = useState(() => readThemePreference(getStorage()));
  const choose = (id) => { setPref(id); setTheme(id, { storage: getStorage() }); };
  return (
    <Card style={{ marginBottom: 14 }}>
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }} className="mb-2">Apariencia</p>
      <div className="flex gap-2" role="radiogroup" aria-label="Tema de la app">
        {THEME_OPTIONS.map((o) => {
          const Icon = ICONS[o.id]; const on = pref === o.id;
          return (
            <button key={o.id} role="radio" aria-checked={on} onClick={() => choose(o.id)} className="flex-1 flex flex-col items-center gap-1 rounded-xl py-2.5 px-1"
              style={{ background: on ? T.tealSoft : T.bg, border: `1px solid ${on ? T.teal : T.border}` }}>
              <Icon size={18} color={on ? T.teal : T.inkSoft} />
              <span style={{ fontSize: 11.5, color: on ? T.teal : T.inkSoft, fontFamily: FONT_BODY, fontWeight: on ? 600 : 400, textAlign: 'center' }}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
