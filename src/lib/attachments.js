// Recibos adjuntos a un movimiento — lógica pura (sin red ni DOM).

export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024; // igual que el límite del bucket
export const ATTACHMENT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export const isImageMime = (mime) => typeof mime === 'string' && mime.startsWith('image/');

// null si el archivo sirve; si no, el mensaje para mostrarle a la persona.
export function validateAttachment(file) {
  if (!file) return 'Elige un archivo.';
  if (!ATTACHMENT_MIMES.includes(file.type)) return 'Solo se pueden adjuntar fotos (JPG, PNG, WebP) o PDF.';
  if (file.size > ATTACHMENT_MAX_BYTES) return 'El archivo pesa más de 8 MB. Toma la foto con menos resolución o comprímelo.';
  if (file.size === 0) return 'El archivo está vacío.';
  return null;
}

// Ruta en el bucket: <hogar>/<movimiento>/<id>.<ext> — la política de Storage revisa las dos carpetas.
export function attachmentPath(householdId, transactionId, mime, fileId) {
  return `${householdId}/${transactionId}/${fileId}.${EXT[mime] || 'bin'}`;
}

// Tamaño al que se reduce una foto para no subir 6 MB de un celular: el lado mayor queda en maxSide.
export function fitWithin(width, height, maxSide) {
  const longest = Math.max(width, height);
  if (!(longest > maxSide)) return { width, height, scaled: false };
  const k = maxSide / longest;
  return { width: Math.round(width * k), height: Math.round(height * k), scaled: true };
}

export function formatBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// { [transactionId]: cantidad } a partir de las filas de transaction_attachments.
export function countByTransaction(rows) {
  const out = {};
  (rows || []).forEach((r) => { out[r.transactionId] = (out[r.transactionId] || 0) + 1; });
  return out;
}
