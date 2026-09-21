import React, { useState } from 'react';
import { Rocket, Check, Circle, X } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY } from '../ui/theme';
import { Card, ProgressBar } from '../ui/primitives';
import { onboardingSteps, onboardingProgress } from '../lib/onboarding';
import { readJSON, writeJSON, getStorage } from '../lib/safeStorage';

const key = (householdId) => `fam_onboarding_dismissed_v1:${householdId}`;

// Dashboard: lista de primeros pasos que se marca sola; se puede ocultar y desaparece al completarla.
export function PrimerosPasos({ data, householdId, setModal, setTab }) {
  const [hidden, setHidden] = useState(() => readJSON(getStorage(), key(householdId), false) === true);
  const steps = onboardingSteps(data);
  const p = onboardingProgress(steps);
  if (hidden || p.complete) return null;

  const go = (cta) => { if (cta.modal) setModal({ type: cta.modal }); else if (cta.tab) setTab(cta.tab); };
  const hide = () => { writeJSON(getStorage(), key(householdId), true); setHidden(true); };

  return (
    <Card style={{ marginBottom: 16, background: T.tealSoft, border: 'none' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2"><Rocket size={16} color={T.teal} /><span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Primeros pasos</span></div>
        <button onClick={hide} aria-label="Ocultar primeros pasos" className="p-1"><X size={15} color={T.inkSoft} /></button>
      </div>
      <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">{p.done} de {p.total} listos · {p.next ? `sigue: ${p.next.title.toLowerCase()}` : ''}</p>
      <ProgressBar value={p.pct} color={T.teal} bg={T.surface} />
      <div className="mt-3 flex flex-col gap-2">
        {steps.map((s) => (
          <div key={s.id} className="flex items-start gap-2">
            {s.done ? <Check size={16} color={T.teal} style={{ marginTop: 2, flexShrink: 0 }} /> : <Circle size={16} color={T.inkSoft} style={{ marginTop: 2, flexShrink: 0 }} />}
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 13, color: s.done ? T.inkSoft : T.ink, fontFamily: FONT_BODY, fontWeight: 600, textDecoration: s.done ? 'line-through' : 'none' }}>{s.title}</p>
              {!s.done && <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>{s.hint}</p>}
            </div>
            {!s.done && (
              <button onClick={() => go(s.cta)} className="rounded-full px-3 py-1 flex-shrink-0" style={{ background: T.teal }}>
                <span style={{ fontSize: 11.5, color: '#fff', fontFamily: FONT_BODY, fontWeight: 600 }}>{s.cta.label}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
