import React, { useState } from 'react';
import {
  Bell, AlertTriangle, Target, TrendingUp, Calendar, Sparkles, Info, Trash2, Lightbulb, X, Check, Archive, ArchiveRestore, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY } from '../ui/theme';
import { EmptyState, IconButton } from '../ui/primitives';
import { SwipeRow } from '../components/SwipeRow';
import { formatDate } from '../lib/format';
import { daysUntil } from '../lib/finance';
import { notificationsInView, notificationCounts } from '../lib/notificationStates';

const NOTIFICATION_ICONS = {
  budget_projection: { icon: AlertTriangle, color: T.gold, bg: T.goldSoft },
  goal_pace: { icon: Target, color: T.coral, bg: T.coralSoft },
  extra_income: { icon: TrendingUp, color: T.teal, bg: T.tealSoft },
  credit_due: { icon: Calendar, color: T.ink, bg: T.bg },
  surplus_opportunity: { icon: Sparkles, color: T.gold, bg: T.goldSoft },
  suggestion: { icon: Lightbulb, color: T.gold, bg: T.goldSoft },
  suggestion_update: { icon: Lightbulb, color: T.teal, bg: T.tealSoft },
  monthly_review: { icon: Calendar, color: T.teal, bg: T.tealSoft },
};

export function relativeDay(iso) {
  const d = daysUntil(iso.slice(0, 10)) * -1; // días desde que se creó (negativo hacia atrás con daysUntil)
  if (d <= 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  if (d < 7) return `Hace ${d} días`;
  return formatDate(iso.slice(0, 10));
}

function NotificationCard({ n }) {
  const conf = NOTIFICATION_ICONS[n.type] || { icon: Info, color: T.ink, bg: T.bg };
  const Icon = conf.icon;
  return (
    <div className="p-3 flex items-start gap-2.5" style={{ background: n.read ? T.surface : conf.bg, border: `1px solid ${n.read ? T.border : conf.bg}`, borderRadius: 12 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color={conf.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: n.read ? 500 : 700 }}>{n.title}</p>
          {!n.read && <div style={{ width: 7, height: 7, borderRadius: 4, background: T.coral, flexShrink: 0, marginTop: 4 }} />}
        </div>
        <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-0.5">{n.body}</p>
        <span style={{ fontSize: 10.5, color: T.inkSoft }} className="block mt-1">{relativeDay(n.createdAt)}</span>
      </div>
    </div>
  );
}

// Pop-up anclado a la campana (no ocupa toda la pantalla). Muestra solo las notificaciones
// sin leer; las leídas y archivadas viven en otra vista dentro del mismo pop-up. Cada
// notificación se desliza a la izquierda para mostrar sus acciones.
export function NotificationsPanel({ data, actions, onClose }) {
  const [screen, setScreen] = useState('inbox'); // inbox | history
  const [tab, setTab] = useState('read'); // read | archived (dentro de history)
  const all = data.notifications || [];
  const counts = notificationCounts(all);
  const view = screen === 'inbox' ? 'unread' : tab;
  const list = notificationsInView(all, view);

  const act = (n, action) => actions.setNotificationsState([n.id], action);
  const actionsFor = (n) => {
    const remove = { key: 'delete', label: 'Eliminar', icon: Trash2, color: '#fff', bg: T.danger, onClick: () => act(n, 'delete') };
    if (view === 'unread') {
      return [
        { key: 'read', label: 'Marcar como leída', short: 'Leída', icon: Check, color: '#fff', bg: T.teal, onClick: () => act(n, 'read') },
        { key: 'archive', label: 'Archivar', icon: Archive, color: '#fff', bg: T.gold, onClick: () => act(n, 'archive') },
        remove,
      ];
    }
    if (view === 'read') {
      return [{ key: 'archive', label: 'Archivar', icon: Archive, color: '#fff', bg: T.gold, onClick: () => act(n, 'archive') }, remove];
    }
    return [{ key: 'unarchive', label: 'Desarchivar', short: 'Sacar', icon: ArchiveRestore, color: '#fff', bg: T.teal, onClick: () => act(n, 'unarchive') }, remove];
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        role="dialog" aria-label="Notificaciones"
        className="fixed z-50 rounded-2xl shadow-lg flex flex-col overflow-hidden"
        style={{ top: 72, right: 12, width: 'min(94vw, 380px)', maxHeight: 'min(72vh, 580px)', background: T.surface, border: `1px solid ${T.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${T.border}` }}>
          {screen === 'inbox' ? (
            <h3 style={{ fontFamily: FONT_DISPLAY, color: T.ink }} className="text-base font-semibold">Notificaciones</h3>
          ) : (
            <button onClick={() => setScreen('inbox')} className="flex items-center gap-1" aria-label="Volver a las notificaciones">
              <ChevronLeft size={18} color={T.ink} />
              <span style={{ fontFamily: FONT_DISPLAY, color: T.ink }} className="text-base font-semibold">Leídas y archivadas</span>
            </button>
          )}
          <IconButton icon={X} onClick={onClose} label="Cerrar" />
        </div>

        {screen === 'history' && (
          <div className="flex gap-2 px-4 pt-3 flex-shrink-0">
            {[['read', 'Leídas', counts.read], ['archived', 'Archivadas', counts.archived]].map(([id, label, n]) => (
              <button key={id} onClick={() => setTab(id)} className="rounded-full px-3 py-1" aria-pressed={tab === id}
                style={{ background: tab === id ? T.teal : T.bg, border: `1px solid ${tab === id ? T.teal : T.border}` }}>
                <span style={{ fontSize: 12, fontFamily: FONT_BODY, fontWeight: 600, color: tab === id ? '#fff' : T.inkSoft }}>{label} ({n})</span>
              </button>
            ))}
          </div>
        )}

        <div className="px-4 py-3 overflow-y-auto flex-1 min-h-0">
          {screen === 'inbox' && counts.unread > 0 && (
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>{counts.unread} sin leer</span>
              <button onClick={() => actions.setNotificationsState(list.map((n) => n.id), 'read')}>
                <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Marcar todas como leídas</span>
              </button>
            </div>
          )}

          {list.length === 0 && screen === 'inbox' && (
            <EmptyState icon={<Bell size={30} color={T.teal} />} title="Estás al día" subtitle="No tienes notificaciones sin leer. Las alertas de presupuestos, objetivos y créditos aparecerán aquí." />
          )}
          {list.length === 0 && screen === 'history' && (
            <p style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }} className="text-center py-6">
              {tab === 'read' ? 'No tienes notificaciones leídas sin archivar.' : 'No tienes notificaciones archivadas.'}
            </p>
          )}

          <div className="flex flex-col gap-2">
            {list.map((n) => (
              <SwipeRow key={n.id} actions={actionsFor(n)}>
                <NotificationCard n={n} />
              </SwipeRow>
            ))}
          </div>

          {list.length > 0 && (
            <p style={{ fontSize: 10.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="text-center mt-3">Desliza una notificación hacia la izquierda para ver sus acciones.</p>
          )}
        </div>

        {screen === 'inbox' && (
          <button onClick={() => setScreen('history')} className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderTop: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 13, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Ver leídas y archivadas ({counts.read + counts.archived})</span>
            <ChevronRight size={16} color={T.teal} />
          </button>
        )}
      </div>
    </>
  );
}
