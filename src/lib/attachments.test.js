import { describe, it, expect } from 'vitest';
import { validateAttachment, attachmentPath, fitWithin, formatBytes, countByTransaction, isImageMime, ATTACHMENT_MAX_BYTES } from './attachments';

const file = (type, size) => ({ type, size });

describe('validateAttachment', () => {
  it('acepta fotos y PDF dentro del límite', () => {
    ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].forEach((t) => expect(validateAttachment(file(t, 1000))).toBeNull());
  });
  it('rechaza otros tipos, archivos vacíos y demasiado grandes', () => {
    expect(validateAttachment(file('text/html', 10))).toMatch(/fotos/);
    expect(validateAttachment(file('image/jpeg', 0))).toMatch(/vacío/);
    expect(validateAttachment(file('image/jpeg', ATTACHMENT_MAX_BYTES + 1))).toMatch(/8 MB/);
    expect(validateAttachment(null)).toBeTruthy();
  });
  it('el límite exacto sí pasa', () => expect(validateAttachment(file('application/pdf', ATTACHMENT_MAX_BYTES))).toBeNull());
});

describe('attachmentPath', () => {
  it('arma <hogar>/<movimiento>/<id>.<ext>', () => {
    expect(attachmentPath('h1', 't1', 'image/jpeg', 'abc')).toBe('h1/t1/abc.jpg');
    expect(attachmentPath('h1', 't1', 'application/pdf', 'abc')).toBe('h1/t1/abc.pdf');
    expect(attachmentPath('h1', 't1', 'image/webp', 'abc')).toBe('h1/t1/abc.webp');
  });
});

describe('fitWithin', () => {
  it('reduce manteniendo la proporción cuando pasa del máximo', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200, scaled: true });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600, scaled: true });
  });
  it('no agranda ni toca lo que ya cabe', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(fitWithin(1600, 1000, 1600).scaled).toBe(false);
  });
});

describe('formatBytes / isImageMime / countByTransaction', () => {
  it('formatea tamaños', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3,5 MB');
  });
  it('distingue imágenes de PDF', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('application/pdf')).toBe(false);
    expect(isImageMime(undefined)).toBe(false);
  });
  it('cuenta recibos por movimiento', () => {
    expect(countByTransaction([{ transactionId: 'a' }, { transactionId: 'a' }, { transactionId: 'b' }])).toEqual({ a: 2, b: 1 });
    expect(countByTransaction(undefined)).toEqual({});
  });
});
