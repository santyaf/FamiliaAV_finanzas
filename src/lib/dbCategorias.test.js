import { describe, it, expect, vi, beforeEach } from 'vitest';

let deleteResult; let countResult; let selectArgs;
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: (table) => ({
      delete: () => ({ eq: async () => deleteResult }),
      select: (...args) => { selectArgs = { table, args }; return { eq: async () => countResult }; },
    }),
  },
}));
import { removeCategory } from './db';

beforeEach(() => { deleteResult = { error: null }; countResult = { count: 0 }; selectArgs = null; });

describe('removeCategory', () => {
  it('borra una categoría sin uso', async () => {
    await expect(removeCategory('c1')).resolves.toBeUndefined();
  });
  it('si tiene movimientos, explica cuántos en vez de mostrar el error de la base', async () => {
    deleteResult = { error: { code: '23503', message: 'violates foreign key constraint "transactions_category_id_fkey"' } };
    countResult = { count: 12 };
    await expect(removeCategory('c1')).rejects.toThrow(/12 movimientos usan esta categoría/);
    expect(selectArgs.table).toBe('transactions');
  });
  it('con un solo movimiento habla en singular', async () => {
    deleteResult = { error: { code: '23503', message: 'x' } };
    countResult = { count: 1 };
    await expect(removeCategory('c1')).rejects.toThrow(/1 movimiento usa esta categoría/);
  });
  it('si el uso es de presupuestos o plantillas, lo dice', async () => {
    deleteResult = { error: { code: '23503', message: 'x' } };
    countResult = { count: 0 };
    await expect(removeCategory('c1')).rejects.toThrow(/presupuestos, plantillas u obligaciones/);
  });
  it('otros errores se propagan tal cual', async () => {
    deleteResult = { error: { code: '42501', message: 'permiso denegado' } };
    await expect(removeCategory('c1')).rejects.toMatchObject({ message: 'permiso denegado' });
  });
});
