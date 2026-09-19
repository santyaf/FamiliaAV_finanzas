import React, { useRef, useState, useEffect } from 'react';
import { Camera, Paperclip, FileText, Trash2, X, Image as ImageIcon } from 'lucide-react';
import { T, FONT_BODY } from '../ui/theme';
import { Modal, PrimaryButton, GhostButton, IconButton } from '../ui/primitives';
import { validateAttachment, isImageMime, formatBytes } from '../lib/attachments';
import { compressImage } from '../lib/imageCompress';

// Selector de recibo para el formulario de un movimiento nuevo (foto de la cámara, galería o PDF).
export function ReceiptPicker({ file, onChange }) {
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);
  const [error, setError] = useState('');

  function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problem = validateAttachment(f);
    if (problem) { setError(problem); return; }
    setError('');
    onChange(f);
  }

  return (
    <div className="mb-4">
      <p style={{ fontSize: 13, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-1.5">Recibo o factura (opcional)</p>
      {file ? (
        <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: T.tealSoft }}>
          {isImageMime(file.type) ? <ImageIcon size={16} color={T.teal} /> : <FileText size={16} color={T.teal} />}
          <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>{file.name || 'Recibo'} · {formatBytes(file.size)}</span>
          <button type="button" onClick={() => onChange(null)} aria-label="Quitar recibo"><X size={16} color={T.inkSoft} /></button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
            <Camera size={15} color={T.ink} /><span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>Tomar foto</span>
          </button>
          <button type="button" onClick={() => galleryRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5" style={{ background: T.bg, border: `1px solid ${T.border}` }}>
            <Paperclip size={15} color={T.ink} /><span style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY }}>Elegir archivo</span>
          </button>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} aria-label="Foto del recibo" />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={pick} aria-label="Archivo del recibo" />
      {error && <p style={{ color: T.danger, fontSize: 12 }} className="mt-1.5">{error}</p>}
    </div>
  );
}

// Recibos de un movimiento ya guardado: ver, agregar y quitar.
export function ReceiptsModal({ data, actions, payload, onClose }) {
  const { transaction } = payload;
  const [items, setItems] = useState(null);
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const galleryRef = useRef(null);
  const cameraRef = useRef(null);

  async function load() {
    try {
      const list = await actions.loadAttachments(transaction.id);
      setItems(list);
      const pairs = await Promise.all(list.map(async (a) => [a.id, await actions.getAttachmentUrl(a.path).catch(() => null)]));
      setUrls(Object.fromEntries(pairs));
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los recibos.');
      setItems([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function add(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const problem = validateAttachment(f);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      await actions.uploadAttachment(transaction.id, await compressImage(f));
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }
  async function remove(a) {
    if (!window.confirm('¿Quitar este recibo? Se borra el archivo.')) return;
    setError('');
    try { await actions.deleteAttachment(a); await load(); } catch (err) { setError(err.message || 'No se pudo quitar el recibo.'); }
  }

  return (
    <Modal title="Recibos del movimiento" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: T.ink, fontFamily: FONT_BODY, fontWeight: 500 }}>{transaction.description || 'Movimiento'}</p>
      <p style={{ fontSize: 11.5, color: T.inkSoft, fontFamily: FONT_BODY }} className="mb-3">Guarda la foto de la factura para garantías, reembolsos o la declaración de renta. Solo la ven quienes pueden ver este movimiento.</p>

      {items === null && <p style={{ fontSize: 12.5, color: T.inkSoft }}>Cargando…</p>}
      {items?.length === 0 && <p style={{ fontSize: 12.5, color: T.inkSoft }} className="mb-3">Este movimiento todavía no tiene recibos.</p>}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {items?.map((a) => (
          <div key={a.id} className="relative rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}`, background: T.bg }}>
            {isImageMime(a.mime) ? (
              urls[a.id]
                ? <a href={urls[a.id]} target="_blank" rel="noreferrer"><img src={urls[a.id]} alt={a.fileName || 'Recibo'} style={{ width: '100%', height: 120, objectFit: 'cover' }} /></a>
                : <div style={{ height: 120 }} className="flex items-center justify-center"><ImageIcon size={22} color={T.inkSoft} /></div>
            ) : (
              <a href={urls[a.id] || '#'} target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center gap-1" style={{ height: 120 }}>
                <FileText size={26} color={T.teal} /><span style={{ fontSize: 11, color: T.ink, fontFamily: FONT_BODY }}>PDF · {formatBytes(a.sizeBytes)}</span>
              </a>
            )}
            <div className="absolute top-1 right-1 rounded-full" style={{ background: 'rgba(255,255,255,0.9)' }}>
              <IconButton icon={Trash2} variant="danger" size={14} onClick={() => remove(a)} label="Quitar recibo" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <GhostButton full onClick={() => cameraRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', fontSize: 13.5 }}><Camera size={15} /> Tomar foto</GhostButton>
        <PrimaryButton full onClick={() => galleryRef.current?.click()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 12px', fontSize: 13.5 }}><Paperclip size={15} /> {busy ? 'Subiendo…' : 'Agregar'}</PrimaryButton>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={add} aria-label="Foto del recibo" />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={add} aria-label="Archivo del recibo" />
      {error && <p style={{ color: T.danger, fontSize: 12.5 }} className="mt-3">{error}</p>}
    </Modal>
  );
}
