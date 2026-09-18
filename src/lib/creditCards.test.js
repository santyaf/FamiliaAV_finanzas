import { describe, it, expect } from 'vitest';
import {
  cardUsage, cardCycle, firstBillDate, planSchedule, planOutstanding, planNextInstallment,
  duePlanInstallments, planOverview, buildRedefer, payToAvoidInterest,
} from './creditCards';

const plan = (o = {}) => ({
  id: 'p1', principal: 1200000, annualRate: 0, installments: 12, firstBillDate: '2026-10-15', billedCount: 0, status: 'activo', ...o,
});

describe('cardUsage', () => {
  it('cupo, deuda y disponible salen del saldo de la cuenta', () => {
    expect(cardUsage({ creditLimit: 5000000 }, -1500000)).toEqual({ limit: 5000000, used: 1500000, credit: 0, available: 3500000, utilization: 0.3 });
  });
  it('sin cupo configurado no inventa un disponible', () => {
    const u = cardUsage({}, -200);
    expect(u.available).toBeNull();
    expect(u.utilization).toBeNull();
    expect(u.used).toBe(200);
  });
  it('un saldo a favor no cuenta como deuda', () => {
    expect(cardUsage({ creditLimit: 1000 }, 300)).toMatchObject({ used: 0, credit: 300, available: 1000 });
  });
  it('si se pasó del cupo, el disponible es negativo', () => {
    expect(cardUsage({ creditLimit: 1000 }, -1200).available).toBe(-200);
  });
});

describe('cardCycle', () => {
  const card = { statementDay: 15, paymentDay: 30 };
  it('antes del corte: el pago que viene es el del corte de este mes', () => {
    expect(cardCycle(card, '2026-09-10')).toEqual({ lastStatement: '2026-08-15', nextStatement: '2026-09-15', paymentDue: '2026-09-30' });
  });
  it('después del corte: el pago vence el día límite de ese mes', () => {
    expect(cardCycle(card, '2026-09-20')).toEqual({ lastStatement: '2026-09-15', nextStatement: '2026-10-15', paymentDue: '2026-09-30' });
  });
  it('si el día de pago es menor al de corte, el pago cae al mes siguiente', () => {
    expect(cardCycle({ statementDay: 25, paymentDay: 10 }, '2026-09-26')).toEqual({ lastStatement: '2026-09-25', nextStatement: '2026-10-25', paymentDue: '2026-10-10' });
  });
  it('el día 31 se ajusta a meses cortos y cruza de año', () => {
    expect(cardCycle({ statementDay: 31, paymentDay: 15 }, '2027-01-10')).toMatchObject({ lastStatement: '2026-12-31', nextStatement: '2027-01-31', paymentDue: '2027-01-15' });
    expect(cardCycle({ statementDay: 31 }, '2026-03-05')).toMatchObject({ lastStatement: '2026-02-28', nextStatement: '2026-03-31' });
  });
  it('sin día de corte no hay ciclo', () => {
    expect(cardCycle({}, '2026-09-10')).toEqual({ lastStatement: null, nextStatement: null, paymentDue: null });
  });
});

describe('firstBillDate', () => {
  it('una compra antes del corte se factura en el corte de ese mes; después, en el del siguiente', () => {
    expect(firstBillDate('2026-09-10', 15)).toBe('2026-09-15');
    expect(firstBillDate('2026-09-15', 15)).toBe('2026-09-15');
    expect(firstBillDate('2026-09-16', 15)).toBe('2026-10-15');
  });
});

describe('planSchedule', () => {
  it('a 0% reparte el capital en cuotas iguales, sin intereses', () => {
    const rows = planSchedule(plan());
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ capital: 100000, interest: 0, dueDate: '2026-10-15' });
    expect(rows[11].balanceAfter).toBeCloseTo(0, 6);
  });
  it('con tasa, la cuota es fija y el interés baja con el saldo', () => {
    const rows = planSchedule(plan({ principal: 1000000, annualRate: 30, installments: 6 }));
    expect(rows[0].interest).toBeGreaterThan(rows[5].interest);
    expect(rows[0].capital + rows[0].interest).toBeCloseTo(rows[3].capital + rows[3].interest, 4);
    expect(rows.reduce((s, r) => s + r.capital, 0)).toBeCloseTo(1000000, 4);
  });
  it('plan vacío o inválido no genera cuotas', () => {
    expect(planSchedule(plan({ principal: 0 }))).toEqual([]);
    expect(planSchedule(plan({ installments: 0 }))).toEqual([]);
  });
});

describe('planOutstanding / planOverview', () => {
  it('sin facturar, todo el capital sigue diferido', () => {
    expect(planOutstanding(plan())).toBe(1200000);
  });
  it('cada cuota facturada baja el capital diferido', () => {
    expect(planOutstanding(plan({ billedCount: 3 }))).toBe(900000);
  });
  it('totalmente facturado: nada diferido', () => {
    expect(planOutstanding(plan({ billedCount: 12 }))).toBe(0);
  });
  it('planNextInstallment devuelve la siguiente por facturar', () => {
    expect(planNextInstallment(plan({ billedCount: 2 })).installmentNumber).toBe(3);
    expect(planNextInstallment(plan({ billedCount: 12 }))).toBeNull();
  });
  it('overview resume lo que falta', () => {
    const o = planOverview(plan({ principal: 1000000, annualRate: 24, installments: 10, billedCount: 4 }));
    expect(o.billed).toBe(4);
    expect(o.total).toBe(10);
    expect(o.next.installmentNumber).toBe(5);
    expect(o.remainingInterest).toBeGreaterThan(0);
  });
});

describe('duePlanInstallments', () => {
  it('devuelve las cuotas cuyo corte ya llegó y no se han facturado', () => {
    const p = plan({ billedCount: 1 });
    expect(duePlanInstallments(p, '2026-12-15').map((r) => r.installmentNumber)).toEqual([2, 3]);
    expect(duePlanInstallments(p, '2026-10-16')).toEqual([]);
  });
  it('un plan pagado no factura nada', () => {
    expect(duePlanInstallments(plan({ status: 'pagado', billedCount: 12 }), '2030-01-01')).toEqual([]);
  });
});

describe('buildRedefer', () => {
  it('rediferir con más cuotas baja la cuota y sube los intereses totales', () => {
    const p = plan({ principal: 1200000, annualRate: 24, installments: 12, billedCount: 4 });
    const r = buildRedefer(p, { annualRate: 24, installments: 24 });
    expect(r.balanceBefore).toBeCloseTo(planOutstanding(p), 2);
    expect(r.after.next.capital + r.after.next.interest).toBeLessThan(r.before.next.capital + r.before.next.interest);
    expect(r.after.remainingInterest).toBeGreaterThan(r.before.remainingInterest);
    expect(r.plan.billedCount).toBe(0);
    expect(r.plan.firstBillDate).toBe(r.before.next.dueDate);
  });
  it('un abono a capital baja el saldo diferido', () => {
    const p = plan({ principal: 1000000, annualRate: 0, installments: 10, billedCount: 0 });
    const r = buildRedefer(p, { annualRate: 0, installments: 5, extraPayment: 200000 });
    expect(r.balanceAfter).toBe(800000);
    expect(r.after.next.capital).toBe(160000);
  });
  it('abonar todo el saldo deja el plan pagado', () => {
    const r = buildRedefer(plan({ principal: 500000, installments: 5 }), { annualRate: 0, installments: 5, extraPayment: 500000 });
    expect(r.plan.status).toBe('pagado');
    expect(r.balanceAfter).toBe(0);
  });
  it('sin cuotas por facturar no hay nada que rediferir', () => {
    const r = buildRedefer(plan({ billedCount: 12 }), { annualRate: 10, installments: 6 });
    expect(r.balanceBefore).toBe(0);
    expect(r.plan.status).toBe('pagado');
  });
});

describe('payToAvoidInterest', () => {
  it('la deuda menos lo que sigue diferido', () => {
    const plans = [plan({ billedCount: 3 }), plan({ id: 'p2', principal: 600000, installments: 6 })];
    expect(payToAvoidInterest(2000000, plans)).toEqual({ deferred: 1500000, payNow: 500000 });
  });
  it('nunca da negativo', () => {
    expect(payToAvoidInterest(100, [plan()]).payNow).toBe(0);
  });
});
