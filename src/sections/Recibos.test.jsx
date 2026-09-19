// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ReceiptPicker, ReceiptsModal } from './Recibos';

afterEach(() => cleanup());

const file = (name, type, size = 1000) => { const f = new File(['x'], name, { type }); Object.defineProperty(f, 'size', { value: size }); return f; };
const pick = (label, f) => fireEvent.change(screen.getByLabelText(label), { target: { files: [f] } });

describe('ReceiptPicker', () => {
  it('una foto válida se entrega y se muestra con su nombre', () => {
    const onChange = vi.fn();
    render(<ReceiptPicker file={null} onChange={onChange} />);
    const f = file('factura.jpg', 'image/jpeg');
    pick('Archivo del recibo', f);
    expect(onChange).toHaveBeenCalledWith(f);
  });
  it('rechaza tipos no permitidos y archivos muy grandes con un mensaje', () => {
    const onChange = vi.fn();
    render(<ReceiptPicker file={null} onChange={onChange} />);
    pick('Archivo del recibo', file('virus.exe', 'application/x-msdownload'));
    expect(screen.getByText(/Solo se pueden adjuntar fotos/)).toBeTruthy();
    pick('Archivo del recibo', file('grande.jpg', 'image/jpeg', 20 * 1024 * 1024));
    expect(screen.getByText(/8 MB/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('con un archivo elegido se puede quitar', () => {
    const onChange = vi.fn();
    render(<ReceiptPicker file={file('a.pdf', 'application/pdf')} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar recibo' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('ReceiptsModal', () => {
  const tx = { id: 't1', description: 'Nevera' };
  const items = [
    { id: 'a1', path: 'h/t1/a1.jpg', mime: 'image/jpeg', sizeBytes: 2000, fileName: 'foto.jpg' },
    { id: 'a2', path: 'h/t1/a2.pdf', mime: 'application/pdf', sizeBytes: 5000, fileName: 'garantia.pdf' },
  ];
  const mkActions = (over = {}) => ({
    loadAttachments: vi.fn().mockResolvedValue(items),
    getAttachmentUrl: vi.fn().mockImplementation(async (p) => `https://signed/${p}`),
    uploadAttachment: vi.fn().mockResolvedValue(),
    deleteAttachment: vi.fn().mockResolvedValue(),
    ...over,
  });

  it('lista los recibos con URL firmada (foto y PDF)', async () => {
    render(<ReceiptsModal data={{}} actions={mkActions()} payload={{ transaction: tx }} onClose={() => {}} />);
    const img = await screen.findByAltText('foto.jpg');
    expect(img.getAttribute('src')).toBe('https://signed/h/t1/a1.jpg');
    expect(screen.getByText(/PDF/)).toBeTruthy();
  });

  it('sin recibos lo dice', async () => {
    render(<ReceiptsModal data={{}} actions={mkActions({ loadAttachments: vi.fn().mockResolvedValue([]) })} payload={{ transaction: tx }} onClose={() => {}} />);
    expect(await screen.findByText(/todavía no tiene recibos/)).toBeTruthy();
  });

  it('agregar sube el archivo al movimiento y recarga', async () => {
    const actions = mkActions();
    render(<ReceiptsModal data={{}} actions={actions} payload={{ transaction: tx }} onClose={() => {}} />);
    await screen.findByAltText('foto.jpg');
    const f = file('nueva.png', 'image/png');
    pick('Archivo del recibo', f);
    await waitFor(() => expect(actions.uploadAttachment).toHaveBeenCalledWith('t1', f));
    await waitFor(() => expect(actions.loadAttachments).toHaveBeenCalledTimes(2));
  });

  it('quitar pide confirmación y borra el recibo', async () => {
    const actions = mkActions();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ReceiptsModal data={{}} actions={actions} payload={{ transaction: tx }} onClose={() => {}} />);
    await screen.findByAltText('foto.jpg');
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar recibo' })[0]);
    await waitFor(() => expect(actions.deleteAttachment).toHaveBeenCalledWith(items[0]));
  });

  it('muestra el error si la subida falla', async () => {
    const actions = mkActions({ uploadAttachment: vi.fn().mockRejectedValue(new Error('Sin conexión')) });
    render(<ReceiptsModal data={{}} actions={actions} payload={{ transaction: tx }} onClose={() => {}} />);
    await screen.findByAltText('foto.jpg');
    pick('Archivo del recibo', file('nueva.png', 'image/png'));
    expect(await screen.findByText('Sin conexión')).toBeTruthy();
  });
});
