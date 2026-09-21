import { describe, it, expect } from 'vitest';
import { buildUserExport, transactionsToCsv, exportFileName } from './dataExport';

const data = {
  householdName: 'Casa', currency: 'COP',
  members: [{ id: 'm1', name: 'Ana', role: 'admin' }, { id: 'm2', name: 'Luis' }],
  accounts: [{ id: 'a1', name: 'Nómina' }],
  categories: [{ id: 'c1', name: 'Mercado', type: 'expense', groupName: 'Alimentación', nature: 'operativo', isFixed: false }],
  transactions: [
    { id: 't2', type: 'expense', description: 'Pan; "integral"', amount: 12500.5, categoryId: 'c1', accountId: 'a1', memberId: 'm1', date: '2026-09-10', isShared: true },
    { id: 't1', type: 'income', description: 'Sueldo', amount: 3000000, accountId: 'a1', memberId: 'm1', date: '2026-09-01' },
    { id: 't3', type: 'settlement', amount: 5, date: '2026-09-11' },
  ],
  goals: [], budgets: [], obligations: [],
  creditsWithPayments: [{ credit: { id: 'k1', name: 'Libranza' }, payments: [{ installmentNumber: 1 }] }],
  cardPlans: [{ id: 'p1' }],
};

describe('buildUserExport', () => {
  const out = buildUserExport({ data, userId: 'm1', exportedAt: '2026-09-19T10:00:00Z' });
  it('trae lo visible de la persona con formato y versión', () => {
    expect(out.formato).toBe('finanzas-hogar-export');
    expect(out.version).toBe(1);
    expect(out.yo).toEqual({ id: 'm1', nombre: 'Ana' });
    expect(out.movimientos).toHaveLength(3);
    expect(out.hogar).toEqual({ nombre: 'Casa', moneda: 'COP' });
  });
  it('los créditos llevan sus cuotas y las tarjetas sus planes', () => {
    expect(out.creditos[0]).toMatchObject({ name: 'Libranza', cuotas: [{ installmentNumber: 1 }] });
    expect(out.compras_diferidas_tarjeta).toHaveLength(1);
  });
  it('incluye activos, plantillas y solicitudes de gasto con sus votos', () => {
    const o = buildUserExport({ data: {
      ...data, assets: [{ id: 'as1', name: 'Apartamento' }], templates: [{ id: 'tp1', name: 'Mercado' }],
      spendRequests: [{ id: 'r1', title: 'Nevera' }, { id: 'r2', title: 'Viaje' }], spendVotes: [{ requestId: 'r1', memberId: 'm2', vote: 'approve' }],
    }, userId: 'm1', exportedAt: 'x' });
    expect(o.activos).toHaveLength(1);
    expect(o.plantillas).toHaveLength(1);
    expect(o.solicitudes_de_gasto[0].votos).toEqual([{ requestId: 'r1', memberId: 'm2', vote: 'approve' }]);
    expect(o.solicitudes_de_gasto[1].votos).toEqual([]);
  });
  it('es serializable a JSON', () => {
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow();
  });
  it('sin créditos ni planes no falla', () => {
    const o = buildUserExport({ data: { ...data, creditsWithPayments: undefined, cardPlans: undefined }, userId: 'm2', exportedAt: 'x' });
    expect(o.creditos).toEqual([]);
    expect(o.compras_diferidas_tarjeta).toEqual([]);
  });
});

describe('transactionsToCsv', () => {
  const csv = transactionsToCsv(data);
  const lines = csv.split('\r\n');
  it('encabezado y orden por fecha, sin conciliaciones', () => {
    expect(lines[0]).toBe('Fecha;Tipo;Descripción;Monto;Categoría;Cuenta;Integrante;Compartido;Recurrente');
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith('2026-09-01;Ingreso;Sueldo;3000000')).toBe(true);
  });
  it('coma decimal y celdas con ; o comillas escapadas', () => {
    expect(lines[2]).toContain('"Pan; ""integral"""');
    expect(lines[2]).toContain(';12500,5;');
    expect(lines[2]).toContain(';Mercado;Nómina;Ana;Sí;No');
  });
});

describe('exportFileName', () => {
  it('arma el nombre con fecha', () => expect(exportFileName('mis-datos', '2026-09-19', 'json')).toBe('mis-datos-2026-09-19.json'));
});
