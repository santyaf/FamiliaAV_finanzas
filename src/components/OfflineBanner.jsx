import React from 'react';
import { WifiOff, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { T, FONT_BODY } from '../ui/theme';

// Franja de estado de conexión / cola offline. Prioridad: sin conexión >
// movimientos que el servidor rechazó > enviando pendientes > datos guardados.
export function OfflineBanner({ online, stale, pending, failed, syncing, onSyncNow }) {
  const plural = (n) => `${n} movimiento${n === 1 ? '' : 's'}`;
  let tone = null;
  let text = '';
  let Icon = WifiOff;
  let showRetry = false;

  if (!online) {
    tone = { bg: T.amberSoft, fg: T.amber };
    text = pending > 0
      ? `Sin conexión — ${plural(pending)} guardado${pending === 1 ? '' : 's'} en este dispositivo, se enviará${pending === 1 ? '' : 'n'} al volver la señal.`
      : 'Sin conexión — lo que registres se guardará en este dispositivo y se enviará al volver la señal.';
    if (stale) text += ' Estás viendo los últimos datos guardados.';
  } else if (failed > 0) {
    tone = { bg: T.coralSoft, fg: T.coral };
    Icon = AlertTriangle;
    const lo = failed === 1 ? 'lo' : 'los';
    text = `${plural(failed)} ${failed === 1 ? 'no se pudo' : 'no se pudieron'} guardar. Revísa${lo} en Movimientos: puedes descartar${lo} o reintentar.`;
    showRetry = true;
  } else if (pending > 0) {
    tone = { bg: T.tealSoft, fg: T.teal };
    Icon = syncing ? Loader2 : RefreshCw;
    text = `Enviando ${plural(pending)} pendiente${pending === 1 ? '' : 's'}…`;
    showRetry = !syncing;
  } else if (stale) {
    tone = { bg: T.tealSoft, fg: T.teal };
    Icon = Loader2;
    text = 'Actualizando datos…';
  }

  if (!tone) return null;

  return (
    <div role="status" className="flex items-start gap-2 rounded-xl px-3 py-2 mt-3" style={{ background: tone.bg }}>
      <Icon size={15} color={tone.fg} className={Icon === Loader2 ? 'animate-spin' : ''} style={{ marginTop: 2, flexShrink: 0 }} />
      <p style={{ fontSize: 12, color: T.ink, fontFamily: FONT_BODY, flex: 1 }}>{text}</p>
      {showRetry && (
        <button onClick={onSyncNow} className="flex-shrink-0" style={{ fontSize: 12, color: tone.fg, fontFamily: FONT_BODY, fontWeight: 600, minHeight: 24 }}>
          Reintentar
        </button>
      )}
    </div>
  );
}
