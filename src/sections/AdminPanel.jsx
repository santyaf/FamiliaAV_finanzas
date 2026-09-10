import React, { useState, useEffect } from 'react';
import { Bot, Plus, ShieldAlert, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle } from '../ui/theme';
import { Card, IconButton, PrimaryButton, GhostButton, Field } from '../ui/primitives';
import { formatDate } from '../lib/format';

const AI_PROVIDERS = [
  { id: 'none', label: 'Ninguna (Registro rápido desactivado)', defaultModel: null },
  { id: 'claude', label: 'Claude (Anthropic)', defaultModel: 'claude-sonnet-4-6' },
  { id: 'openai', label: 'ChatGPT (OpenAI)', defaultModel: 'gpt-4o-mini' },
  { id: 'gemini', label: 'Gemini (Google)', defaultModel: 'gemini-3.6-flash' },
];
const NOTIFICATION_TYPE_LABELS = {
  notif_budget_projection_enabled: 'Proyección temprana de presupuesto',
  notif_goal_pace_enabled: 'Ritmo de objetivos',
  notif_extra_income_enabled: 'Ingresos extraordinarios',
  notif_credit_due_enabled: 'Cuotas de crédito por vencer',
  notif_surplus_opportunity_enabled: 'Excedente familiar del mes',
};

export function AdminPanel({ data, actions }) {
  const [households, setHouseholds] = useState(null);
  const [householdsError, setHouseholdsError] = useState('');
  const [admins, setAdmins] = useState(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshAll() {
    try {
      setHouseholds(await actions.listAllHouseholdsAdmin());
    } catch (e) {
      setHouseholdsError(e.message || 'No se pudo cargar la lista de hogares.');
    }
    setAdmins(await actions.listPlatformAdmins());
  }
  useEffect(() => { refreshAll(); }, []);

  const settings = data.settings;
  const quickCaptureEnabled = settings.quick_capture_enabled !== false;
  const currentProvider = quickCaptureEnabled ? (settings.ai_provider || 'claude') : 'none';

  async function toggleQuickCapture() {
    const next = !quickCaptureEnabled;
    await actions.updateSetting('quick_capture_enabled', next);
    if (!next) await actions.updateSetting('ai_provider', 'none');
  }
  async function changeProvider(providerId) {
    const provider = AI_PROVIDERS.find((p) => p.id === providerId);
    await actions.updateSetting('ai_provider', providerId);
    if (provider.defaultModel) await actions.updateSetting('ai_model', provider.defaultModel);
    await actions.updateSetting('quick_capture_enabled', providerId !== 'none');
  }

  async function addAdmin() {
    if (!newAdminEmail.trim()) return;
    setBusy(true); setError('');
    try {
      await actions.promoteToAdmin(newAdminEmail.trim());
      setNewAdminEmail('');
      await refreshAll();
    } catch (e) {
      setError(e.message || 'No se pudo promover a este usuario.');
    } finally {
      setBusy(false);
    }
  }
  async function removeAdmin(userId) {
    if (!confirm('¿Quitar permisos de superusuario a esta persona?')) return;
    await actions.removeAdmin(userId);
    await refreshAll();
  }

  return (
    <div className="pb-4 pt-2">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert size={18} color={T.coral} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }}>Administración</p>
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Panel de superusuario — estos cambios afectan a toda la plataforma, no solo a tu hogar.
      </p>

      <Card style={{ marginBottom: 14 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Registro rápido con IA</p>
        <button onClick={toggleQuickCapture} className="flex items-center justify-between w-full rounded-xl p-3" style={{ background: T.bg }}>
          <span style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY }}>{quickCaptureEnabled ? 'Activado para todo el mundo' : 'Desactivado para todo el mundo'}</span>
          {quickCaptureEnabled ? <ToggleRight size={26} color={T.teal} /> : <ToggleLeft size={26} color={T.inkSoft} />}
        </button>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <div className="flex items-center gap-2 mb-3">
          <Bot size={15} color={T.ink} />
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Proveedor de IA</p>
        </div>
        <div className="flex flex-col gap-2">
          {AI_PROVIDERS.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-xl p-3" style={{ background: currentProvider === p.id ? T.tealSoft : T.bg, border: `1px solid ${currentProvider === p.id ? T.teal : T.border}` }}>
              <input type="radio" checked={currentProvider === p.id} onChange={() => changeProvider(p.id)} />
              <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{p.label}</span>
            </label>
          ))}
        </div>
        {currentProvider !== 'none' && (
          <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-3">
            Modelo actual: <span style={{ fontFamily: FONT_MONO }}>{settings.ai_model}</span>. Cada proveedor necesita su propia clave configurada en Vercel ({'\u00a0'}<span style={{ fontFamily: FONT_MONO }}>ANTHROPIC_API_KEY</span> / <span style={{ fontFamily: FONT_MONO }}>OPENAI_API_KEY</span> / <span style={{ fontFamily: FONT_MONO }}>GOOGLE_API_KEY</span>).
          </p>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-1">Tipos de notificación</p>
        <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Actívalas o desactívalas para toda la plataforma. Cada usuario también puede apagarlas para sí mismo desde su propia bandeja.</p>
        <div className="flex flex-col gap-2">
          {Object.entries(NOTIFICATION_TYPE_LABELS).map(([key, label]) => {
            const enabled = settings[key] !== false;
            return (
              <button key={key} onClick={() => actions.updateSetting(key, !enabled)} className="flex items-center justify-between rounded-xl p-3" style={{ background: T.bg }}>
                <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{label}</span>
                {enabled ? <ToggleRight size={22} color={T.teal} /> : <ToggleLeft size={22} color={T.inkSoft} />}
              </button>
            );
          })}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Superusuarios</p>
        {admins?.map((a) => (
          <div key={a.userId} className="flex items-center justify-between mb-2">
            <span style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY }}>{a.name}</span>
            <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeAdmin(a.userId)} label="Quitar superusuario" />
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <input style={{ ...inputStyle, flex: 1 }} type="email" placeholder="correo@ejemplo.com" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} />
          <button onClick={addAdmin} aria-label="Agregar superusuario" className="flex items-center justify-center active:scale-90 transition-transform" style={{ background: T.teal, borderRadius: 10, minWidth: TAP_MIN, height: TAP_MIN }}>
            <Plus color="#fff" size={18} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">La persona debe tener ya una cuenta creada en la app.</p>
        {error && <p style={{ color: T.danger, fontSize: 12 }} className="mt-2">{error}</p>}
      </Card>

      <Card>
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }} className="mb-3">Hogares en la plataforma {households ? `(${households.length})` : ''}</p>
        {householdsError && <p style={{ color: T.danger, fontSize: 12 }} className="mb-2">{householdsError}</p>}
        {!households && !householdsError && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Cargando…</p>}
        {households?.length === 0 && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Aún no hay hogares creados en la plataforma.</p>}
        {households?.map((h) => (
          <div key={h.id} className="mb-3 pb-3" style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="flex items-center justify-between">
              <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{h.name}</p>
              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.inkSoft }}>{h.memberCount} integrante{h.memberCount === 1 ? '' : 's'}</span>
            </div>
            <p style={{ fontSize: 10.5, color: T.inkSoft }}>{formatDate(h.createdAt.slice(0, 10))} · {h.currency}{h.memberNames ? ` · ${h.memberNames}` : ''}</p>
          </div>
        ))}
        <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2">Solo se muestran metadatos — no el detalle financiero de cada hogar.</p>
      </Card>
    </div>
  );
}
