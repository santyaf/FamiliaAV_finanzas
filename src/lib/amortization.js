// Todas las funciones son puras (sin efectos secundarios) para poder probarlas
// y reutilizarlas tanto al crear un crédito como al recalcular por un abono a capital.

function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
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
export function generateSchedule({ principal, annualRate, termMonths, system, insuranceMonthly, startDate, startInstallment = 1 }) {
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
        dueDate: addMonths(startDate, n + 1),
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
        dueDate: addMonths(startDate, n + 1),
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
 * @param {string} fromDate fecha desde la que empiezan las nuevas cuotas
 * @param {number} nextInstallmentNumber número de la próxima cuota a generar
 */
export function recalcAfterExtraPayment({
  currentBalance, extraAmount, strategy, annualRate, system,
  remainingMonths, insuranceMonthly, fromDate, nextInstallmentNumber,
}) {
  const newBalance = Math.max(0, currentBalance - extraAmount);
  if (newBalance <= 0) return [];
  const i = annualToMonthlyRate(annualRate);

  if (strategy === 'reducir_cuota') {
    // mismo plazo restante, cuota (o abono fijo si es alemán) más baja
    return generateSchedule({
      principal: newBalance, annualRate, termMonths: remainingMonths, system,
      insuranceMonthly, startDate: fromDate, startInstallment: nextInstallmentNumber,
    });
  }

  // reducir_plazo: se mantiene el valor de cuota/abono a capital original, se acorta el número de cuotas
  if (system === 'aleman') {
    const originalFixedCapital = currentBalance / remainingMonths; // aproximación con el abono fijo vigente
    const newTerm = Math.max(1, Math.ceil(newBalance / originalFixedCapital));
    return generateSchedule({
      principal: newBalance, annualRate, termMonths: newTerm, system,
      insuranceMonthly, startDate: fromDate, startInstallment: nextInstallmentNumber,
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
      dueDate: addMonths(fromDate, n + 1),
      capital, interest, insurance: insuranceMonthly,
      total: capital + interest + insuranceMonthly,
      balanceAfter: balance,
    });
  }
  return rows;
}
