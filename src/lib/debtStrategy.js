// Estrategias de pago de deuda a nivel portafolio (avalancha vs bola de nieve) — lógica pura.
// Simula mes a mes todos los créditos: cada uno paga su cuota (capital + interés) y el dinero extra,
// más lo que liberan los créditos ya pagados, se dirige a uno según la estrategia:
//   avalancha       → primero el de mayor tasa (paga menos intereses en total)
//   bola de nieve   → primero el de menor saldo (los "triunfos" llegan antes)
//   solo mínimos    → cada crédito con su cuota, sin reasignar nada (punto de comparación)
// El seguro de las cuotas no se simula: se sigue pagando igual con cualquier estrategia.
import { annualToMonthlyRate } from './amortization';
import { creditOutstandingBalance } from './finance';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const STRATEGIES = [
  { id: 'avalancha', label: 'Avalancha', hint: 'Primero el de mayor tasa: es la que menos intereses paga.' },
  { id: 'bola_de_nieve', label: 'Bola de nieve', hint: 'Primero el de menor saldo: liquidas deudas antes y te motivas.' },
];

// Deudas en la moneda del hogar con saldo y cuota (capital + interés) de la próxima cuota.
export function debtsFromCredits(creditsWithPayments, currency) {
  return (creditsWithPayments || [])
    .filter(({ credit }) => credit.status !== 'pagado' && (credit.currency || currency) === currency)
    .map(({ credit, payments }) => {
      const next = [...(payments || [])].filter((p) => !p.paid).sort((a, b) => a.installmentNumber - b.installmentNumber)[0];
      return {
        id: credit.id, name: credit.name, balance: creditOutstandingBalance(credit, payments), annualRate: credit.annualRate || 0,
        minPayment: next ? round2((next.capital || 0) + (next.interest || 0)) : 0,
      };
    })
    .filter((d) => d.balance > 0.5 && d.minPayment > 0);
}

export function simulatePayoff(debts, { extra = 0, strategy = 'avalancha', maxMonths = 600 } = {}) {
  const list = debts.map((d) => ({ ...d, balance: d.balance, month: null, rate: annualToMonthlyRate(d.annualRate) }));
  let month = 0; let totalInterest = 0; let totalPaid = 0;
  const rolling = strategy !== 'minimos';
  const priority = (a, b) => (strategy === 'bola_de_nieve' ? a.balance - b.balance : b.annualRate - a.annualRate || a.balance - b.balance);

  while (list.some((d) => d.balance > 0.005) && month < maxMonths) {
    month++;
    // intereses del mes
    list.forEach((d) => { if (d.balance > 0) { const i = d.balance * d.rate; d.balance += i; totalInterest += i; } });
    // cuota mínima de cada crédito
    let freed = 0;
    list.forEach((d) => {
      if (d.balance <= 0.005) { if (rolling) freed += d.minPayment; return; }
      const pay = Math.min(d.minPayment, d.balance);
      d.balance -= pay; totalPaid += pay;
      if (d.balance <= 0.005) { d.balance = 0; d.month = month; if (rolling) freed += d.minPayment - pay; }
    });
    // extra + lo liberado, al crédito prioritario (y si alcanza, al siguiente)
    if (rolling) {
      let pool = extra + freed;
      [...list].filter((d) => d.balance > 0.005).sort(priority).forEach((d) => {
        if (pool <= 0) return;
        const pay = Math.min(pool, d.balance);
        d.balance -= pay; pool -= pay; totalPaid += pay;
        if (d.balance <= 0.005) { d.balance = 0; d.month = month; }
      });
    }
  }
  const finished = list.every((d) => d.balance <= 0.005);
  return {
    months: finished ? month : null, finished, totalInterest: round2(totalInterest), totalPaid: round2(totalPaid),
    payoffs: list.map((d) => ({ id: d.id, name: d.name, month: d.month })).sort((a, b) => (a.month ?? Infinity) - (b.month ?? Infinity)),
  };
}

// Compara las dos estrategias contra pagar solo los mínimos.
export function compareStrategies(debts, extra) {
  const base = simulatePayoff(debts, { strategy: 'minimos' });
  const results = {};
  STRATEGIES.forEach((s) => {
    const sim = simulatePayoff(debts, { extra, strategy: s.id });
    results[s.id] = {
      ...sim,
      interestSaved: base.finished && sim.finished ? round2(base.totalInterest - sim.totalInterest) : null,
      monthsSaved: base.finished && sim.finished ? base.months - sim.months : null,
    };
  });
  return { base, ...results, best: results.avalancha.finished && results.bola_de_nieve.finished
    ? (results.avalancha.totalInterest <= results.bola_de_nieve.totalInterest ? 'avalancha' : 'bola_de_nieve') : null };
}
