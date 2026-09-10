import React, { useState, useEffect } from 'react';
import {
  QrCode, Copy, UserPlus, Plus, Trash2, ShieldAlert, ChevronRight, ExternalLink,
  BellRing, BellOff, Clock,
} from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, FONT_MONO, inputStyle, DAY_LABELS, CURRENCIES } from '../ui/theme';
import {
  Card, CategoryIcon, CATEGORY_ICON_OPTIONS, Field, GhostButton, IconButton, MemberChip, Modal, PrimaryButton,
} from '../ui/primitives';
import { formatDate } from '../lib/format';
import { todayISO } from '../lib/finance';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function UvrCard({ actions }) {
  const [uvr, setUvr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualDate, setManualDate] = useState(todayISO());
  const [manualValue, setManualValue] = useState('');
  const [saved, setSaved] = useState(false);

  async function fetchUvr() {
    setLoading(true);
    try { setUvr(await actions.getLatestUvr()); } finally { setLoading(false); }
  }
  useEffect(() => { fetchUvr(); }, []);

  async function saveManual() {
    const v = parseFloat(manualValue);
    if (!v || !manualDate) return;
    await actions.saveManualUvr(manualDate, v);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    fetchUvr();
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }} className="mb-2">Valor UVR</p>
      {loading && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Consultando…</p>}
      {uvr && <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Último valor {uvr.cached ? 'guardado' : 'consultado automáticamente'}: <b style={{ color: T.ink }}>${uvr.value.toLocaleString('es-CO')}</b> ({formatDate(uvr.date)})</p>}
      {!uvr && !loading && <p style={{ fontSize: 12.5, color: T.danger }} className="mb-3">No se pudo consultar el valor automáticamente. Consúltalo en la fuente oficial e ingrésalo manualmente:</p>}
      <a href="https://suameca.banrep.gov.co/estadisticas-economicas/informacionSerie/100005/unidad_valor_real_uvr" target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 mb-3">
        <ExternalLink size={12} color={T.teal} />
        <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Consultar en el Banco de la República</span>
      </a>
      <div className="flex gap-2">
        <input style={{ ...inputStyle, flex: 1 }} type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
        <input style={{ ...inputStyle, flex: 1 }} type="number" placeholder="Valor UVR" value={manualValue} onChange={(e) => setManualValue(e.target.value)} />
      </div>
      <GhostButton full onClick={saveManual} style={{ marginTop: 10 }}>{saved ? '¡Guardado!' : 'Guardar valor manual'}</GhostButton>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/* AJUSTES                                                                */
/* ---------------------------------------------------------------------- */
export function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const [showIosSteps, setShowIosSteps] = useState(false);

  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(window.navigator.userAgent);

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onInstalled() { setInstalled(true); setDeferredPrompt(null); }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!deferredPrompt && !isIos) return null; // otro navegador de escritorio sin soporte — no mostramos nada

  return (
    <Card style={{ marginBottom: 14, background: T.tealSoft, border: 'none' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 13.5, color: T.ink }}>Instalar la app</p>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Agrégala a tu pantalla de inicio para usarla como una app nativa.</p>
        </div>
        {deferredPrompt ? (
          <PrimaryButton onClick={async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; setDeferredPrompt(null); }} style={{ padding: '8px 14px', fontSize: 12.5, flexShrink: 0 }}>
            Instalar
          </PrimaryButton>
        ) : (
          <GhostButton onClick={() => setShowIosSteps((v) => !v)} style={{ padding: '8px 14px', fontSize: 12.5, flexShrink: 0 }}>
            Cómo
          </GhostButton>
        )}
      </div>
      {isIos && showIosSteps && (
        <div className="mt-3 pt-3" style={{ borderTop: `1px solid rgba(0,0,0,0.08)` }}>
          {!isSafari && (
            <p style={{ fontSize: 11.5, color: T.danger, fontFamily: FONT_BODY }} className="mb-2">Abre este enlace en <b>Safari</b> — desde otros navegadores de iPhone no se puede instalar.</p>
          )}
          <ol className="flex flex-col gap-1.5">
            <li style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>1. Toca el ícono de <b>Compartir</b> (el cuadrado con la flecha hacia arriba)</li>
            <li style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>2. Baja y elige <b>"Agregar a inicio"</b></li>
            <li style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY }}>3. Toca <b>Agregar</b> arriba a la derecha</li>
          </ol>
        </div>
      )}
    </Card>
  );
}

export function RemindersCard({ actions, setModal }) {
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [subscribing, setSubscribing] = useState(false);
  const [schedules, setSchedules] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    setSchedules(await actions.loadReminderSchedules());
  }
  useEffect(() => { refresh(); }, []);

  async function enablePush() {
    setSubscribing(true); setError('');
    try {
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
        throw new Error('Este navegador no soporta notificaciones push.');
      }
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') throw new Error('No diste permiso para las notificaciones.');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
        });
      }
      await actions.savePushSubscription(sub.toJSON());
    } catch (e) {
      setError(e.message || 'No se pudo activar las notificaciones.');
    } finally {
      setSubscribing(false);
    }
  }

  async function toggleSchedule(s) {
    await actions.updateReminderSchedule(s.id, { enabled: !s.enabled });
    await refresh();
  }
  async function removeSchedule(id) {
    await actions.removeReminderSchedule(id);
    await refresh();
  }

  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2 mb-1">
        <BellRing size={16} color={T.ink} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Recordatorios</p>
      </div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Notificaciones push para que no se te olvide registrar tus movimientos — funcionan aunque tengas la app cerrada.</p>

      {permission !== 'granted' && (
        <GhostButton full onClick={enablePush} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <BellRing size={14} /> {subscribing ? 'Activando…' : 'Activar notificaciones push en este dispositivo'}
        </GhostButton>
      )}
      {permission === 'denied' && (
        <p style={{ fontSize: 11, color: T.danger, fontFamily: FONT_BODY }} className="mb-3">Bloqueaste las notificaciones para este sitio — actívalas desde la configuración del navegador para poder usar recordatorios.</p>
      )}
      {error && <p style={{ fontSize: 11.5, color: T.danger, fontFamily: FONT_BODY }} className="mb-3">{error}</p>}

      {schedules?.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-xl p-2.5 mb-2" style={{ background: s.enabled ? T.tealSoft : T.bg }}>
          <div>
            <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{s.label}</p>
            <p style={{ fontSize: 10.5, color: T.inkSoft }}>
              {s.timeOfDay} · {s.daysOfWeek.length === 7 ? 'Todos los días' : s.daysOfWeek.map((d) => DAY_LABELS[d]).join(' ')}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <IconButton icon={s.enabled ? BellRing : BellOff} size={16} onClick={() => toggleSchedule(s)} color={s.enabled ? T.teal : T.inkSoft} label={s.enabled ? 'Desactivar' : 'Activar'} />
            <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeSchedule(s.id)} confirmMessage="¿Eliminar este recordatorio?" label="Eliminar recordatorio" />
          </div>
        </div>
      ))}

      <GhostButton full onClick={() => setModal({ type: 'reminder', onDone: refresh })} style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> Nuevo recordatorio
      </GhostButton>
    </Card>
  );
}

export function ReminderModal({ actions, onClose, onDone }) {
  const [label, setLabel] = useState('Registrar movimientos');
  const [time, setTime] = useState('20:00');
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function toggleDay(d) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }

  async function save() {
    if (!days.length) { setError('Elige al menos un día.'); return; }
    setSaving(true); setError('');
    try {
      await actions.addReminderSchedule({ label: label.trim() || 'Registrar movimientos', timeOfDay: time, timezone, daysOfWeek: days });
      onDone?.();
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo crear el recordatorio.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Nuevo recordatorio" onClose={onClose}>
      <Field label="Mensaje">
        <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. Registrar movimientos" />
      </Field>
      <Field label="Hora (tu zona horaria detectada es esta)">
        <input style={inputStyle} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </Field>
      <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">Zona horaria: <span style={{ fontFamily: FONT_MONO }}>{timezone}</span></p>
      <Field label="Días">
        <div className="flex gap-1.5">
          {DAY_LABELS.map((label, i) => (
            <button key={i} type="button" onClick={() => toggleDay(i)}
              className="flex items-center justify-center rounded-full"
              style={{ width: 36, height: 36, background: days.includes(i) ? T.teal : T.bg, border: `1px solid ${days.includes(i) ? T.teal : T.border}` }}>
              <span style={{ fontSize: 12.5, color: days.includes(i) ? '#fff' : T.inkSoft, fontWeight: 600 }}>{label}</span>
            </button>
          ))}
        </div>
      </Field>
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      <PrimaryButton full onClick={save}>{saving ? 'Guardando…' : 'Crear recordatorio'}</PrimaryButton>
    </Modal>
  );
}

export function Ajustes({ data, update, actions, setModal, setTab }) {
  function removeCategory(id) {
    actions.removeCategory(id);
  }
  return (
    <div className="pb-4 pt-2">
      <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.ink }} className="mb-3">Ajustes</p>

      <InstallAppCard />
      <RemindersCard actions={actions} setModal={setModal} />

      <Card style={{ marginBottom: 14 }}>
        <Field label="Nombre del hogar">
          <input style={inputStyle} value={data.householdName} onChange={(e) => update({ householdName: e.target.value })} />
        </Field>
        <Field label="Moneda">
          <select style={inputStyle} value={data.currency} onChange={(e) => update({ currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </Field>
      </Card>

      <UvrCard actions={actions} />

      <Card style={{ marginBottom: 14 }}>
        <div className="flex items-center justify-between mb-3">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Integrantes</p>
          <button onClick={() => setModal({ type: 'invite' })} className="flex items-center gap-1 rounded-full px-3 py-1.5" style={{ background: T.teal }}>
            <QrCode size={14} color="#fff" /><span style={{ fontSize: 12, color: '#fff', fontFamily: FONT_BODY, fontWeight: 500 }}>Invitar</span>
          </button>
        </div>
        {data.members.map((m) => (
          <div key={m.id} className="flex items-center justify-between mb-2">
            <MemberChip member={m} />
            {m.role === 'admin' && <span style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Admin</span>}
          </div>
        ))}
        <GhostButton full onClick={() => { if (confirm('¿Salir de este hogar? Dejarás de ver sus datos en este dispositivo.')) actions.leaveHousehold(); }} style={{ marginTop: 10, fontSize: 12.5 }}>
          Salir de este hogar
        </GhostButton>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Categorías</p>
          <IconButton icon={Plus} onClick={() => setModal({ type: 'category' })} color={T.teal} label="Nueva categoría" />
        </div>
        <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-2">Ingresos</p>
        {data.categories.filter((c) => c.type === 'income').map((c) => (
          <div key={c.id} className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-2" style={{ fontSize: 13, color: T.ink }}><CategoryIcon icon={c.icon} size={15} /> {c.name}</span>
            <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeCategory(c.id)} confirmMessage={`¿Eliminar la categoría "${c.name}"?`} label="Eliminar categoría" />
          </div>
        ))}
        <p style={{ fontSize: 11.5, color: T.inkSoft }} className="mb-2 mt-3">Gastos</p>
        {data.categories.filter((c) => c.type === 'expense').map((c) => (
          <div key={c.id} className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-2" style={{ fontSize: 13, color: T.ink }}><CategoryIcon icon={c.icon} size={15} /> {c.name}</span>
            <IconButton icon={Trash2} variant="danger" size={14} onClick={() => removeCategory(c.id)} confirmMessage={`¿Eliminar la categoría "${c.name}"?`} label="Eliminar categoría" />
          </div>
        ))}
      </Card>

      {data.isPlatformAdmin && (
        <Card style={{ marginTop: 14 }}>
          <button onClick={() => setTab('admin')} className="flex items-center justify-between w-full active:opacity-60" style={{ minHeight: 40 }}>
            <span className="flex items-center gap-2" style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>
              <ShieldAlert size={16} color={T.coral} /> Administración de la plataforma
            </span>
            <ChevronRight size={18} color={T.inkSoft} />
          </button>
          <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">
            Ajustes globales que afectan a todos los hogares (Registro rápido, proveedor de IA, notificaciones, superusuarios).
          </p>
        </Card>
      )}
    </div>
  );
}

export function InviteModal({ data, actions, onClose }) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true); setError('');
    try {
      const inv = await actions.createInvite();
      setInvite(inv);
    } catch (e) {
      setError(e.message || 'No se pudo crear la invitación.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { generate(); }, []);

  const joinUrl = invite ? `${window.location.origin}${window.location.pathname}?token=${invite.token}` : '';
  const qrUrl = invite ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(joinUrl)}` : '';

  function copyLink() {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal title="Invitar a un integrante" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-4">
        Pide a la persona que escanee este código con la cámara de su celular, o comparte el enlace directamente. La invitación vence en 3 días.
      </p>
      {loading && <p style={{ fontSize: 13, color: T.inkSoft }} className="text-center py-6">Generando invitación…</p>}
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mb-3">{error}</p>}
      {invite && (
        <>
          <div className="flex justify-center mb-4">
            <img src={qrUrl} alt="Código QR de invitación" width={200} height={200} className="rounded-xl" style={{ border: `1px solid ${T.border}` }} />
          </div>
          <div className="rounded-xl p-3 mb-4 flex items-center justify-between gap-2" style={{ background: T.bg }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: 11.5, color: T.inkSoft, wordBreak: 'break-all' }}>{joinUrl}</p>
          </div>
          <div className="flex gap-2">
            <GhostButton full onClick={copyLink} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Copy size={14} /> {copied ? '¡Copiado!' : 'Copiar enlace'}
            </GhostButton>
            <PrimaryButton full onClick={generate} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <UserPlus size={14} /> Nueva invitación
            </PrimaryButton>
          </div>
        </>
      )}
    </Modal>
  );
}

export function CategoryModal({ data, actions, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [icon, setIcon] = useState(CATEGORY_ICON_OPTIONS[0]);
  async function save() {
    if (!name.trim()) return;
    await actions.addCategory({ name: name.trim(), type, icon });
    onClose();
  }
  return (
    <Modal title="Nueva categoría" onClose={onClose}>
      <Field label="Nombre">
        <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Mascotas" />
      </Field>
      <Field label="Tipo">
        <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
        </select>
      </Field>
      <Field label="Ícono">
        <div className="grid grid-cols-6 gap-2">
          {CATEGORY_ICON_OPTIONS.map((key) => (
            <button key={key} type="button" onClick={() => setIcon(key)}
              className="flex items-center justify-center rounded-xl"
              style={{ width: TAP_MIN, height: TAP_MIN, background: icon === key ? T.tealSoft : T.bg, border: `1.5px solid ${icon === key ? T.teal : T.border}` }}>
              <CategoryIcon icon={key} size={18} color={icon === key ? T.teal : T.inkSoft} />
            </button>
          ))}
        </div>
      </Field>
      <PrimaryButton full onClick={save}>Crear categoría</PrimaryButton>
    </Modal>
  );
}
