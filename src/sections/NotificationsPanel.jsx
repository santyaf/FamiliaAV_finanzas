import React, { useEffect } from 'react';
import { Bell, AlertTriangle, Target, TrendingUp, Calendar, Sparkles, Info } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY } from '../ui/theme';
import { Modal, EmptyState, IconButton } from '../ui/primitives';
import { formatDate } from '../lib/format';
import { daysUntil } from '../lib/finance';

const NOTIFICATION_ICONS = {
  budget_projection: { icon: AlertTriangle, color: T.gold, bg: T.goldSoft },
  goal_pace: { icon: Target, color: T.coral, bg: T.coralSoft },
  extra_income: { icon: TrendingUp, color: T.teal, bg: T.tealSoft },
  credit_due: { icon: Calendar, color: T.ink, bg: T.bg },
  surplus_opportunity: { icon: Sparkles, color: T.gold, bg: T.goldSoft },
};

export function relativeDay(iso) {
  const d = daysUntil(iso.slice(0, 10)) * -1; // días desde que se creó (negativo hacia atrás con daysUntil)
  if (d <= 0) return 'Hoy';
  if (d === 1) return 'Ayer';
  if (d < 7) return `Hace ${d} días`;
  return formatDate(iso.slice(0, 10));
}

export function NotificationsPanel({ data, actions, onClose }) {
  const list = data.notifications || [];

  return (
    <Modal title="Notificaciones" wide onClose={onClose}>
      {list.length === 0 && (
        <EmptyState icon={<Bell size={32} color={T.teal} />} title="Sin notificaciones por ahora" subtitle="Aquí aparecerán alertas de presupuestos, objetivos, créditos y oportunidades cuando la app las detecte." />
      )}
      {list.length > 0 && (
        <div className="flex items-center justify-between mb-3">
          <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }}>{data.unreadCount} sin leer</span>
          {data.unreadCount > 0 && (
            <button onClick={() => actions.markAllNotificationsRead()}>
              <span style={{ fontSize: 12, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Marcar todas como leídas</span>
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {list.map((n) => {
          const conf = NOTIFICATION_ICONS[n.type] || { icon: Info, color: T.ink, bg: T.bg };
          const Icon = conf.icon;
          return (
            <div key={n.id} className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: n.read ? T.surface : conf.bg, border: `1px solid ${n.read ? T.border : conf.bg}` }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={15} color={conf.color} />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p style={{ fontSize: 13, color: T.ink, fontFamily: FONT_BODY, fontWeight: n.read ? 500 : 700 }}>{n.title}</p>
                  {!n.read && <div style={{ width: 7, height: 7, borderRadius: 4, background: T.coral, flexShrink: 0, marginTop: 4 }} />}
                </div>
                <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-0.5">{n.body}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span style={{ fontSize: 10.5, color: T.inkSoft }}>{relativeDay(n.createdAt)}</span>
                  <div className="flex items-center gap-3">
                    {!n.read && (
                      <button onClick={() => actions.markNotificationRead(n.id)}>
                        <span style={{ fontSize: 11, color: T.teal, fontFamily: FONT_BODY, fontWeight: 500 }}>Marcar leída</span>
                      </button>
                    )}
                    <IconButton icon={Trash2} size={13} onClick={() => actions.deleteNotification(n.id)} label="Descartar notificación" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
