// Todas las funciones son puras (sin efectos secundarios) para poder probarlas
// y reutilizarlas tanto al crear un crédito como al recalcular por un abono a capital.

// Suma meses a una fecha AAAA-MM-DD sin errores: trabaja en UTC (no depende de la
// zona horaria) y si el día no existe en el mes destino queda en su último día
// (31 ene + 1 mes = 28/29 feb, no 3 mar).
export function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

// Cómo se puede expresar la tasa de un crédito. Internamente todo se guarda como
// efectiva anual (E.A.); las otras se convierten al ingresarlas.
export const RATE_TYPES = [
  { id: 'EA', label: 'Efectiva anual (E.A.)' },
  { id: 'EM', label: 'Efectiva mensual (E.M.)' },
  { id: 'NMV', label: 'Nominal anual, mes vencido (N.M.V.)' },
];
// valuePct: la tasa tal como la dice el banco (ej. 1.8 para "1,8% mensual").
export function toEffectiveAnnual(valuePct, type = 'EA') {
  const v = valuePct / 100;
  if (type === 'EM') return (Math.pow(1 + v, 12) - 1) * 100;
  if (type === 'NMV') return (Math.pow(1 + v / 12, 12) - 1) * 100;
  return valuePct;
}
export function fromEffectiveAnnual(eaPct, type = 'EA') {
  const ea = eaPct / 100;
  if (type === 'EM') return (Math.pow(1 + ea, 1 / 12) - 1) * 100;
  if (type === 'NMV') return (Math.pow(1 + ea, 1 / 12) - 1) * 12 * 100;
  return eaPct;
}

// Convierte una tasa efectiva anual (%) a tasa efectiva mensual (decimal)
export function annualToMonthlyRate(annualRatePct) {
  const ea = annualRatePct / 100;
  return Math.pow(1 + ea, 1 / 12) - 1;
}

/**
 * Genera la tabla de amortización completa desde cero.
 * @returns {Array} cuotas [{installmentNumber, dueDate, capital, interest, insurance, total, balanceAfter}]
 */
export function generateSchedule({ principal, annualRate, termMonths, system, insuranceMonthly, startDate, firstDueDate, startInstallment = 1 }) {
  // firstDueDate: vencimiento de la primera cuota (ej. el día de nómina de una libranza); si
  // no se da, es un mes después de startDate.
  const dueOf = (n) => (firstDueDate ? addMonths(firstDueDate, n) : addMonths(startDate, n + 1));
  const i = annualToMonthlyRate(annualRate);
  const rows = [];
  let balance = principal;

  if (system === 'aleman') {
    const fixedCapital = principal / termMonths;
    for (let n = 0; n < termMonths; n++) {
      const interest = balance * i;
      const capital = Math.min(fixedCapital, balance);
      balance = Math.max(0, balance - capital);
      rows.push({
        installmentNumber: startInstallment + n,
        dueDate: dueOf(n),
        capital, interest, insurance: insuranceMonthly,
        total: capital + interest + insuranceMonthly,
        balanceAfter: balance,
      });
    }
  } else {
    // sistema francés: cuota fija (capital + interés); el seguro se suma aparte
    const installment = i === 0 ? principal / termMonths : (principal * i) / (1 - Math.pow(1 + i, -termMonths));
    for (let n = 0; n < termMonths; n++) {
      const interest = balance * i;
      let capital = installment - interest;
      if (n === termMonths - 1 || capital > balance) capital = balance; // ajusta la última cuota por redondeo
      balance = Math.max(0, balance - capital);
      rows.push({
        installmentNumber: startInstallment + n,
        dueDate: dueOf(n),
        capital, interest, insurance: insuranceMonthly,
        total: capital + interest + insuranceMonthly,
        balanceAfter: balance,
      });
    }
  }
  return rows;
}

/**
 * Recalcula las cuotas restantes después de un abono a capital.
 * @param {number} currentBalance saldo antes del abono
 * @param {number} extraAmount monto del abono
 * @param {'reducir_plazo'|'reducir_cuota'} strategy
 * @param {number} annualRate tasa E.A. original del crédito
 * @param {string} system 'frances' | 'aleman'
 * @param {number} remainingMonths plazo restante ANTES del abono
 * @param {number} insuranceMonthly
 * @param {string} fromDate fecha desde la que empiezan las nuevas cuotas (la 1ª vence un mes después)
 * @param {string} [firstDueDate] vencimiento EXACTO de la próxima cuota (si se da, manda sobre fromDate)
 * @param {number} nextInstallmentNumber número de la próxima cuota a generar
 */
export function recalcAfterExtraPayment({
  currentBalance, extraAmount, strategy, annualRate, system,
  remainingMonths, insuranceMonthly, fromDate, firstDueDate, nextInstallmentNumber,
}) {
  const newBalance = Math.max(0, currentBalance - extraAmount);
  if (newBalance <= 0) return [];
  const i = annualToMonthlyRate(annualRate);

  if (strategy === 'reducir_cuota') {
    // mismo plazo restante, cuota (o abono fijo si es alemán) más baja
    return generateSchedule({
      principal: newBalance, annualRate, termMonths: remainingMonths, system,
      insuranceMonthly, startDate: fromDate, firstDueDate, startInstallment: nextInstallmentNumber,
    });
  }

  // reducir_plazo: se mantiene el valor de cuota/abono a capital original, se acorta el número de cuotas
  if (system === 'aleman') {
    const originalFixedCapital = currentBalance / remainingMonths; // aproximación con el abono fijo vigente
    const newTerm = Math.max(1, Math.ceil(newBalance / originalFixedCapital));
    return generateSchedule({
      principal: newBalance, annualRate, termMonths: newTerm, system,
      insuranceMonthly, startDate: fromDate, firstDueDate, startInstallment: nextInstallmentNumber,
    });
  }

  // francés: se mantiene la cuota fija original y se calculan cuántos meses se necesitan para pagar newBalance
  const originalInstallment = i === 0
    ? currentBalance / remainingMonths
    : (currentBalance * i) / (1 - Math.pow(1 + i, -remainingMonths));

  let newTerm;
  if (i === 0) {
    newTerm = Math.max(1, Math.ceil(newBalance / originalInstallment));
  } else {
    const ratio = (newBalance * i) / originalInstallment;
    if (ratio >= 1) {
      // el abono no alcanza a bajar la cuota por debajo del balance; usar plazo original como salvaguarda
      newTerm = remainingMonths;
    } else {
      newTerm = Math.max(1, Math.ceil(-Math.log(1 - ratio) / Math.log(1 + i)));
    }
  }

  // Para conservar la cuota fija original, generamos manualmente con esa cuota (no con generateSchedule,
  // que recalcularía una cuota nueva para el plazo reducido)
  const rows = [];
  let balance = newBalance;
  for (let n = 0; n < newTerm && balance > 0.01; n++) {
    const interest = balance * i;
    let capital = originalInstallment - interest;
    if (capital > balance) capital = balance;
    balance = Math.max(0, balance - capital);
    rows.push({
      installmentNumber: nextInstallmentNumber + n,
      dueDate: firstDueDate ? addMonths(firstDueDate, n) : addMonths(fromDate, n + 1),
      capital, interest, insurance: insuranceMonthly,
      total: capital + interest + insuranceMonthly,
      balanceAfter: balance,
    });
  }
  return rows;
}

// Resumen de un calendario de cuotas (para comparar antes/después de un cambio).
export function summarizeSchedule(rows) {
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  if (!rows.length) return { count: 0, firstTotal: 0, lastDueDate: null, totalInterest: 0, totalInsurance: 0, totalPaid: 0 };
  return {
    count: rows.length,
    firstTotal: round2(rows[0].total),
    lastDueDate: rows[rows.length - 1].dueDate,
    totalInterest: round2(rows.reduce((s, r) => s + r.interest, 0)),
    totalInsurance: round2(rows.reduce((s, r) => s + r.insurance, 0)),
    totalPaid: round2(rows.reduce((s, r) => s + r.total, 0)),
  };
}

/**
 * Retanqueo / rediferido: recalcula las cuotas que faltan sobre un saldo nuevo.
 *  - retanqueo: topUp > 0 (dinero nuevo que se suma al saldo actual)
 *  - rediferido / reestructuración: topUp = 0 y cambia plazo y/o tasa
 * Puede cambiar la cuota, el saldo y la tasa. Las cuotas ya pagadas no se tocan.
 * @returns {{ newBalance, rows, summary }}
 */
export function buildRefinance({
  currentBalance, topUp = 0, annualRate, termMonths, system = 'frances',
  insuranceMonthly = 0, firstDueDate, nextInstallmentNumber,
}) {
  const newBalance = Math.round((currentBalance + topUp + Number.EPSILON) * 100) / 100;
  const rows = newBalance > 0 ? generateSchedule({
    principal: newBalance, annualRate, termMonths, system, insuranceMonthly,
    firstDueDate, startInstallment: nextInstallmentNumber,
  }) : [];
  return { newBalance, rows, summary: summarizeSchedule(rows) };
}
