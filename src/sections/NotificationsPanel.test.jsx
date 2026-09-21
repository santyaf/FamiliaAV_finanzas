// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { NotificationsPanel } from './NotificationsPanel';

afterEach(() => cleanup());

// jsdom no trae PointerEvent: sin él, clientX / pointerId no llegan a los manejadores
if (typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) { super(type, init); this.pointerId = init.pointerId; this.pointerType = init.pointerType; }
  };
}

const today = new Date().toISOString();
const n = (id, title, extra = {}) => ({ id, type: 'credit_due', title, body: `cuerpo de ${title}`, createdAt: today, read: false, archived: false, deleted: false, ...extra });
const notifications = [
  n('u1', 'Sin leer uno'),
  n('u2', 'Sin leer dos'),
  n('r1', 'Ya leída', { read: true }),
  n('a1', 'Archivada', { read: true, archived: true }),
  n('d1', 'Eliminada', { read: true, deleted: true }),
];
const render_ = (over = {}, actionsOver = {}) => {
  const actions = { setNotificationsState: vi.fn(), ...actionsOver };
  render(<NotificationsPanel data={{ notifications, ...over }} actions={actions} onClose={() => {}} />);
  return actions;
};

describe('NotificationsPanel (prueba de humo)', () => {
  it('el pop-up muestra solo las sin leer', () => {
    render_();
    expect(screen.getByText('Sin leer uno')).toBeTruthy();
    expect(screen.getByText('Sin leer dos')).toBeTruthy();
    expect(screen.queryByText('Ya leída')).toBeNull();
    expect(screen.queryByText('Archivada')).toBeNull();
    expect(screen.queryByText('Eliminada')).toBeNull();
    expect(screen.getByText('2 sin leer')).toBeTruthy();
  });

  it('Escape cierra el pop-up y el foco queda dentro al abrirlo', () => {
    const onClose = vi.fn();
    render(<NotificationsPanel data={{ notifications }} actions={{}} onClose={onClose} />);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sin notificaciones sin leer dice que estás al día', () => {
    render(<NotificationsPanel data={{ notifications: [n('r1', 'Ya leída', { read: true })] }} actions={{}} onClose={() => {}} />);
    expect(screen.getByText('Estás al día')).toBeTruthy();
  });

  it('marcar todas como leídas envía solo los ids sin leer', () => {
    const actions = render_();
    fireEvent.click(screen.getByText('Marcar todas como leídas'));
    expect(actions.setNotificationsState).toHaveBeenCalledWith(['u1', 'u2'], 'read');
  });

  it('otra vista: leídas y archivadas por separado', () => {
    render_();
    fireEvent.click(screen.getByText(/Ver leídas y archivadas \(2\)/));
    expect(screen.getByText('Ya leída')).toBeTruthy();
    expect(screen.queryByText('Archivada')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Archivadas \(1\)/ }));
    expect(screen.getByText('Archivada')).toBeTruthy();
    expect(screen.queryByText('Ya leída')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Volver a las notificaciones' }));
    expect(screen.getByText('Sin leer uno')).toBeTruthy();
  });

  it('deslizar (flecha izquierda) muestra las acciones y cada una llama a su acción', () => {
    const actions = render_();
    const open = () => fireEvent.keyDown(screen.getAllByTestId('swipe-front')[0], { key: 'ArrowLeft' });
    open();
    fireEvent.click(screen.getAllByRole('button', { name: 'Archivar' })[0]);
    expect(actions.setNotificationsState).toHaveBeenLastCalledWith(['u1'], 'archive');
    open();
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);
    expect(actions.setNotificationsState).toHaveBeenLastCalledWith(['u1'], 'delete');
    open();
    fireEvent.click(screen.getAllByRole('button', { name: 'Marcar como leída' })[0]);
    expect(actions.setNotificationsState).toHaveBeenLastCalledWith(['u1'], 'read');
  });

  it('en archivadas la acción es desarchivar', () => {
    const actions = render_();
    fireEvent.click(screen.getByText(/Ver leídas y archivadas/));
    fireEvent.click(screen.getByRole('button', { name: /Archivadas/ }));
    fireEvent.keyDown(screen.getAllByTestId('swipe-front')[0], { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'Desarchivar' }));
    expect(actions.setNotificationsState).toHaveBeenCalledWith(['a1'], 'unarchive');
  });

  it('arrastrar la fila hacia la izquierda con el puntero la deja abierta', () => {
    render_();
    const front = screen.getAllByTestId('swipe-front')[0];
    fireEvent.pointerDown(front, { clientX: 300, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(front, { clientX: 200, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(front, { clientX: 200, pointerId: 1, pointerType: 'touch' });
    expect(front.style.transform).toBe('translateX(-168px)');
    expect(screen.getAllByRole('button', { name: 'Eliminar' }).length).toBeGreaterThan(0);
  });

  it('un toque sin arrastrar no abre la fila', () => {
    render_();
    const front = screen.getAllByTestId('swipe-front')[0];
    fireEvent.pointerDown(front, { clientX: 300, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(front, { clientX: 301, pointerId: 1, pointerType: 'touch' });
    expect(front.style.transform).toBe('translateX(0px)');
  });
});
