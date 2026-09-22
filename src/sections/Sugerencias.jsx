import React, { useState, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY, inputStyle } from '../ui/theme';
import { Card, PrimaryButton, GhostButton, EmptyState } from '../ui/primitives';
import { formatDate } from '../lib/format';
import { SUGGESTION_STATUSES, suggestionStatusLabel } from '../lib/suggestions';

const STATUS_STYLE = {
  nueva: { bg: T.goldSoft, fg: T.gold },
  en_revision: { bg: T.bg, fg: T.inkSoft },
  aprobada: { bg: T.tealSoft, fg: T.teal },
  en_desarrollo: { bg: T.tealSoft, fg: T.teal },
  implementada: { bg: T.teal, fg: '#fff' },
  rechazada: { bg: T.coralSoft, fg: T.coral },
};

function StatusPill({ status }) {
  const st = STATUS_STYLE[status] || STATUS_STYLE.nueva;
  return (
    <span className="rounded-full px-2.5 py-0.5 flex-shrink-0" style={{ background: st.bg }}>
      <span style={{ fontSize: 11, color: st.fg, fontFamily: FONT_BODY, fontWeight: 600 }}>{suggestionStatusLabel(status)}</span>
    </span>
  );
}

function Timeline({ events }) {
  if (!events?.length) return null;
  return (
    <div className="mt-2 pl-3" style={{ borderLeft: `2px solid ${T.border}` }}>
      {events.map((e) => (
        <p key={e.id} style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-0.5">
          {formatDate(e.createdAt.slice(0, 10))} · {e.status ? suggestionStatusLabel(e.status) : 'Comentario'}{e.note ? ` — ${e.note}` : ''}
        </p>
      ))}
    </div>
  );
}

// Lo que ve cada persona: sus propias sugerencias y en qué van.
export function MisSugerenciasCard({ actions }) {
  const [list, setList] = useState(null);
  useEffect(() => { actions.loadMySuggestions().then(setList).catch(() => setList([])); }, []);
  if (!list || list.length === 0) return null;
  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb size={16} color={T.gold} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Mis sugerencias</p>
      </div>
      <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">
        Las que enviaste por el chat del Asistente, y en qué van.
      </p>
      <div className="flex flex-col gap-3">
        {list.map((s) => (
          <div key={s.id}>
            <div className="flex items-start justify-between gap-2">
              <p style={{ fontSize: 13.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{s.title}</p>
              <StatusPill status={s.status} />
            </div>
            <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }}>Enviada el {formatDate(s.createdAt.slice(0, 10))}</p>
            {s.adminNote && <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }} className="mt-1">Respuesta: {s.adminNote}</p>}
            <Timeline events={s.events} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function AdminSuggestionCard({ suggestion, onUpdate }) {
  const [note, setNote] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const s = suggestion;

  async function apply(status) {
    setBusy(true); setError('');
    try {
      await onUpdate(s.id, { status, adminNote: note });
      setNote(''); setMoveTo('');
    } catch (e) {
      setError(e.message || 'No se pudo guardar el cambio.');
    } finally {
      setBusy(false);
    }
  }
  const triage = s.status === 'nueva' || s.status === 'en_revision';

  return (
    <Card style={{ marginBottom: 10 }}>
      <div className="flex items-start justify-between gap-2">
        <p style={{ fontSize: 14, color: T.ink, fontFamily: FONT_BODY, fontWeight: 600 }}>{s.title}</p>
        <StatusPill status={s.status} />
      </div>
      <p style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: FONT_BODY, whiteSpace: 'pre-wrap' }} className="mt-1">{s.description}</p>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-1">
        {s.authorName || 'Alguien'}{s.householdName ? ` · ${s.householdName}` : ''} · {formatDate(s.createdAt.slice(0, 10))}
      </p>
      {s.adminNote && <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }} className="mt-1">Nota actual: {s.adminNote}</p>}
      <Timeline events={s.events} />

      <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical', marginTop: 10 }} value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Nota o respuesta para quien sugirió (opcional, la verá en su cuenta)" />
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12 }} className="mt-1">{error}</p>}
      <div className="flex flex-wrap gap-2 mt-2">
        {triage && (
          <>
            <PrimaryButton onClick={() => apply('aprobada')} style={{ opacity: busy ? 0.6 : 1, padding: '8px 14px', fontSize: 13.5 }}>Aprobar</PrimaryButton>
            <GhostButton onClick={() => apply('rechazada')} style={{ padding: '8px 14px', fontSize: 13.5, color: T.coral }}>Rechazar</GhostButton>
          </>
        )}
        <select style={{ ...inputStyle, width: 'auto', fontSize: 13 }} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          <option value="">Mover a…</option>
          {SUGGESTION_STATUSES.filter((x) => x.id !== 'nueva' && x.id !== s.status).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        {moveTo && <GhostButton onClick={() => apply(moveTo)} style={{ padding: '8px 14px', fontSize: 13.5 }}>Guardar</GhostButton>}
      </div>
    </Card>
  );
}

// Bandeja del administrador: todas las sugerencias, con filtro por estado y
// seguimiento (aprobar/rechazar, moverla de etapa y dejar notas).
export function SugerenciasAdmin({ actions }) {
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState('pendientes');
  const [error, setError] = useState('');

  async function load() {
    try {
      setList(await actions.listAllSuggestions());
    } catch (e) {
      setError(e.message || 'No se pudieron cargar las sugerencias.');
      setList([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function update(id, patch) {
    await actions.updateSuggestion(id, patch);
    await load();
  }

  if (!list) return null;
  const pendientes = list.filter((s) => s.status === 'nueva' || s.status === 'en_revision');
  const shown = filter === 'pendientes' ? pendientes : filter === 'todas' ? list : list.filter((s) => s.status === filter);
  const filters = [['pendientes', `Por revisar (${pendientes.length})`], ['todas', `Todas (${list.length})`],
    ...SUGGESTION_STATUSES.filter((x) => x.id !== 'nueva' && x.id !== 'en_revision').map((x) => [x.id, x.label])];

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb size={16} color={T.gold} />
        <p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Sugerencias de las personas</p>
      </div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-2">
        Llegan desde el chat del Asistente. Cada cambio de estado le avisa a quien sugirió.
      </p>
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {filters.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className="flex-shrink-0 rounded-full px-3 py-1.5"
            style={{ background: filter === id ? T.ink : T.surface, border: `1px solid ${filter === id ? T.ink : T.border}` }}>
            <span style={{ fontSize: 12, color: filter === id ? '#fff' : T.inkSoft, fontFamily: FONT_BODY }}>{label}</span>
          </button>
        ))}
      </div>
      {error && <p role="alert" style={{ color: T.danger, fontSize: 12.5 }} className="mb-2">{error}</p>}
      {shown.length === 0 && (
        <EmptyState icon={<Lightbulb size={30} color={T.gold} />} title="Nada por aquí"
          subtitle={filter === 'pendientes' ? 'No hay sugerencias por revisar.' : 'No hay sugerencias en este estado.'} />
      )}
      {shown.map((s) => <AdminSuggestionCard key={s.id} suggestion={s} onUpdate={update} />)}
    </div>
  );
}
