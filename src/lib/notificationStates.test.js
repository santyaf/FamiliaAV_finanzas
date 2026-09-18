import { describe, it, expect } from 'vitest';
import { mergeNotificationStates, notificationsInView, notificationCounts, statePatchFor } from './notificationStates';
import { swipeOffset, settleSwipe } from './swipe';

const n = (id, extra = {}) => ({ id, read: false, ...extra });

describe('mergeNotificationStates', () => {
  it('cada persona tiene su propio estado sobre la misma notificación', () => {
    const list = [n('a'), n('b'), n('c')];
    const mine = mergeNotificationStates(list, [{ notificationId: 'a', readAt: 't' }, { notificationId: 'b', archivedAt: 't' }, { notificationId: 'c', deletedAt: 't' }]);
    expect(mine.map((x) => [x.read, x.archived, x.deleted])).toEqual([[true, false, false], [false, true, false], [false, false, true]]);
    const other = mergeNotificationStates(list, []);
    expect(other.every((x) => !x.read && !x.archived && !x.deleted)).toBe(true);
  });
  it('respeta la columna read anterior', () => {
    expect(mergeNotificationStates([n('a', { read: true })], [])[0].read).toBe(true);
  });
  it('acepta que no lleguen estados', () => {
    expect(mergeNotificationStates([n('a')], undefined)[0].read).toBe(false);
  });
});

describe('notificationsInView / notificationCounts', () => {
  const list = mergeNotificationStates(
    [n('u1'), n('u2'), n('r1'), n('ar1'), n('ar2'), n('del')],
    [
      { notificationId: 'r1', readAt: 't' },
      { notificationId: 'ar1', archivedAt: 't', readAt: 't' },
      { notificationId: 'ar2', archivedAt: 't' },
      { notificationId: 'del', deletedAt: 't', readAt: 't' },
    ],
  );
  it('el pop-up (unread) solo muestra las sin leer y sin archivar', () => {
    expect(notificationsInView(list, 'unread').map((x) => x.id)).toEqual(['u1', 'u2']);
  });
  it('leídas: leídas y no archivadas; archivadas: archivadas aunque no estén leídas', () => {
    expect(notificationsInView(list, 'read').map((x) => x.id)).toEqual(['r1']);
    expect(notificationsInView(list, 'archived').map((x) => x.id)).toEqual(['ar1', 'ar2']);
  });
  it('las eliminadas no aparecen en ninguna vista', () => {
    ['unread', 'read', 'archived'].forEach((v) => expect(notificationsInView(list, v).find((x) => x.id === 'del')).toBeUndefined());
  });
  it('cuenta cada vista', () => {
    expect(notificationCounts(list)).toEqual({ unread: 2, read: 1, archived: 2 });
  });
});

describe('statePatchFor', () => {
  const now = '2026-09-18T10:00:00.000Z';
  it('leer solo marca leída', () => expect(statePatchFor('read', now)).toEqual({ read_at: now }));
  it('archivar y eliminar también la dan por leída', () => {
    expect(statePatchFor('archive', now)).toEqual({ archived_at: now, read_at: now });
    expect(statePatchFor('delete', now)).toEqual({ deleted_at: now, read_at: now });
  });
  it('desarchivar la saca del archivo sin tocar lo demás', () => expect(statePatchFor('unarchive', now)).toEqual({ archived_at: null }));
  it('una acción desconocida falla en voz alta', () => expect(() => statePatchFor('otra', now)).toThrow());
});

describe('swipe', () => {
  it('el desplazamiento nunca pasa de los límites', () => {
    expect(swipeOffset(0, -300, 168)).toBe(-168);
    expect(swipeOffset(0, 50, 168)).toBe(0);
    expect(swipeOffset(-168, 60, 168)).toBe(-108);
  });
  it('un deslizamiento largo a la izquierda deja la fila abierta; uno corto, cerrada', () => {
    expect(settleSwipe(-100, -100, 168)).toBe(-168);
    expect(settleSwipe(-30, -30, 168)).toBe(0);
  });
  it('estando abierta, un empujón claro a la derecha la cierra; uno mínimo la deja abierta', () => {
    expect(settleSwipe(swipeOffset(-168, 60, 168), 60, 168)).toBe(0);
    expect(settleSwipe(swipeOffset(-168, 20, 168), 20, 168)).toBe(-168);
  });
  it('sin movimiento decide por la mitad', () => {
    expect(settleSwipe(-100, 0, 168)).toBe(-168);
    expect(settleSwipe(-50, 0, 168)).toBe(0);
  });
});
