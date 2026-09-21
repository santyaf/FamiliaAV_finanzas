import React, { useState } from 'react';
import { Share2 } from 'lucide-react';
import { T, FONT_DISPLAY, FONT_BODY } from '../ui/theme';
import { Card, GhostButton } from '../ui/primitives';

const MESSAGE = 'Uso Finanzas del Hogar para llevar las cuentas de la familia en conjunto. Échale un vistazo:';

// Ajustes → Recomendar la app: comparte solo el enlace del sitio (nunca datos de tu hogar). Con el menú de
// compartir del celular si existe; si no, copia el enlace.
export function CompartirAppCard({ url = globalThis.location?.origin, nav = globalThis.navigator }) {
  const [note, setNote] = useState('');
  async function share() {
    setNote('');
    try {
      if (nav?.share) { await nav.share({ title: 'Finanzas del Hogar', text: MESSAGE, url }); return; }
      await nav.clipboard.writeText(`${MESSAGE} ${url}`);
      setNote('Enlace copiado. Pégalo donde quieras compartirlo.');
    } catch (e) {
      if (e?.name === 'AbortError') return; // la persona cerró el menú de compartir
      setNote(`No se pudo compartir. El enlace es ${url}`);
    }
  }
  return (
    <Card style={{ marginBottom: 14 }}>
      <div className="flex items-center gap-2 mb-1"><Share2 size={15} color={T.ink} /><p style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14, color: T.ink }}>Recomienda la app</p></div>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Comparte el enlace con otra familia. Solo se envía la dirección de la app: nadie recibe acceso a tu hogar (para eso está Invitar).</p>
      <GhostButton full onClick={share} style={{ fontSize: 13 }}>Compartir la app</GhostButton>
      {note && <p style={{ fontSize: 12, color: T.inkSoft, fontFamily: FONT_BODY }} className="mt-2" role="status">{note}</p>}
    </Card>
  );
}
