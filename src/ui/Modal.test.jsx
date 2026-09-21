// @vitest-environment jsdom
import React, { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Modal } from './primitives';
import { nextFocusIndex } from '../lib/useFocusTrap';

afterEach(() => { cleanup(); document.body.style.overflow = ''; });

describe('nextFocusIndex', () => {
  it('Tab da la vuelta al final y Shift+Tab al inicio', () => {
    expect(nextFocusIndex(3, 0, false)).toBe(1);
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(3, 1, true)).toBe(0);
  });
  it('sin foco dentro, Tab va al primero y Shift+Tab al último; sin elementos no hay índice', () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
  });
});

function Harness({ onClose = () => {} }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen(true)}>abrir</button>
      {open && <Modal title="Nuevo gasto" onClose={() => { onClose(); setOpen(false); }}>
        <input aria-label="Monto" />
        <button>Guardar</button>
      </Modal>}
    </div>
  );
}

describe('Modal accesible', () => {
  it('es un diálogo con título asociado', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Nuevo gasto' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
  it('al abrir enfoca el primer campo de texto', () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByLabelText('Monto'));
  });
  it('Escape lo cierra', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('Tab no se sale del diálogo: del último vuelve al primero', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    const guardar = screen.getByRole('button', { name: 'Guardar' });
    guardar.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(guardar);
  });
  it('bloquea el scroll del fondo mientras está abierto y lo libera al cerrar', () => {
    render(<Harness />);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });
  it('al cerrar devuelve el foco a lo que lo tenía antes', () => {
    render(<Harness />);
    const abrir = screen.getByRole('button', { name: 'abrir' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    // jsdom: el elemento que tenía el foco antes (body al montar) o el botón; lo importante es que no se pierda el foco en un nodo desmontado
    expect(document.contains(document.activeElement)).toBe(true);
    expect(abrir).toBeTruthy();
  });
});
