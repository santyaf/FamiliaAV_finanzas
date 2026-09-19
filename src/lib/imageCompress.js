// Reduce una foto (lado mayor 1600 px, JPEG 82%) antes de subirla. Solo corre en el navegador;
// si algo falla (sin canvas, foto rara) devuelve el archivo original, así nunca bloquea el adjunto.
import { fitWithin } from './attachments';

export async function compressImage(file, { maxSide = 1600, quality = 0.82 } = {}) {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
    const bitmap = await createImageBitmap(file);
    const { width, height, scaled } = fitWithin(bitmap.width, bitmap.height, maxSide);
    if (!scaled && file.size < 1.5 * 1024 * 1024) { bitmap.close?.(); return file; } // ya es liviana
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name || 'recibo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
