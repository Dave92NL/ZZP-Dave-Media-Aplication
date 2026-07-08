'use strict';

const { getDb } = require('../database/db');
const settings = require('./settings');

const DEFAULT_RATES = {
  2025: {
    bracket1_limit: 38441,
    bracket1_rate: 0.3697,
    bracket2_rate: 0.4950,
    zelfstandigenaftrek: 2470,
    startersaftrek: 2123,
    mkb_vrijstelling: 0.1270,
    heffingskorting_max: 3362,
    heffingskorting_afbouw_start: 24813,
    heffingskorting_afbouw_rate: 0.06095,
    arbeidskorting_max: 5532,
    arbeidskorting_afbouw_start: 39957,
    arbeidskorting_afbouw_rate: 0.06510,
    urencriterium: 1225
  }
};

function getRates(year) {
  const db = getDb();
  const key = `tax_rates_${year}`;
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (stored) {
    try { return JSON.parse(stored.value); } catch {}
  }
  return DEFAULT_RATES[year] || DEFAULT_RATES[2025];
}

function saveRates(year, rates) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    `tax_rates_${year}`, JSON.stringify(rates)
  );
  return true;
}

function calculate(year) {
  const db = getDb();
  const rates = getRates(year);
  const yearStr = String(year);

  // Gross income: paid invoices + income entries
  const invoiceIncome = db.prepare(`
    SELECT SUM(total_eur) as total FROM invoices
    WHERE status = 'paid' AND strftime('%Y', paid_date) = ?
  `).get(yearStr)?.total || 0;

  const otherIncome = db.prepare(`
    SELECT SUM(amount_eur) as total FROM income_entries
    WHERE strftime('%Y', date) = ? AND invoice_id IS NULL
  `).get(yearStr)?.total || 0;

  const grossIncome = invoiceIncome + otherIncome;

  // Deductible expenses
  const deductibleExpenses = db.prepare(`
    SELECT SUM(amount_eur) as total FROM expenses
    WHERE strftime('%Y', date) = ? AND is_deductible = 1
  `).get(yearStr)?.total || 0;

  // Hours this year
  const hoursData = db.prepare(`
    SELECT SUM(duration_minutes) / 60.0 as hours FROM time_entries
    WHERE strftime('%Y', date) = ?
  `).get(yearStr);
  const totalHours = hoursData?.hours || 0;
  const meetsUrencriterium = totalHours >= rates.urencriterium;

  // Winst (profit before entrepreneur deductions)
  const winst = Math.max(0, grossIncome - deductibleExpenses);

  // Entrepreneur deductions
  const startersEligible = settings.get('startersaftrek_eligible') === 'true';
  const zelfstandigenaftrek = meetsUrencriterium ? Math.min(rates.zelfstandigenaftrek, winst) : 0;
  const startersaftrek = (meetsUrencriterium && startersEligible) ? Math.min(rates.startersaftrek, winst - zelfstandigenaftrek) : 0;

  const winstAfterDeductions = Math.max(0, winst - zelfstandigenaftrek - startersaftrek);

  // MKB-winstvrijstelling
  const mkbVrijstelling = winstAfterDeductions * rates.mkb_vrijstelling;
  const belastbaarInkomen = Math.max(0, winstAfterDeductions - mkbVrijstelling);

  // Progressive tax
  let taxIB = 0;
  if (belastbaarInkomen <= rates.bracket1_limit) {
    taxIB = belastbaarInkomen * rates.bracket1_rate;
  } else {
    taxIB = rates.bracket1_limit * rates.bracket1_rate +
            (belastbaarInkomen - rates.bracket1_limit) * rates.bracket2_rate;
  }

  // Heffingskorting (algemeen)
  let heffingskorting = rates.heffingskorting_max;
  if (belastbaarInkomen > rates.heffingskorting_afbouw_start) {
    const reduction = (belastbaarInkomen - rates.heffingskorting_afbouw_start) * rates.heffingskorting_afbouw_rate;
    heffingskorting = Math.max(0, rates.heffingskorting_max - reduction);
  }

  // Arbeidskorting
  let arbeidskorting = Math.min(rates.arbeidskorting_max, grossIncome * 0.23);
  if (grossIncome > rates.arbeidskorting_afbouw_start) {
    const reduction = (grossIncome - rates.arbeidskorting_afbouw_start) * rates.arbeidskorting_afbouw_rate;
    arbeidskorting = Math.max(0, arbeidskorting - reduction);
  }

  const totalKortingen = Math.min(taxIB, heffingskorting + arbeidskorting);
  const netTaxIB = Math.max(0, taxIB - totalKortingen);

  return {
    year,
    grossIncome,
    invoiceIncome,
    otherIncome,
    deductibleExpenses,
    winst,
    totalHours,
    meetsUrencriterium,
    zelfstandigenaftrek,
    startersaftrek,
    winstAfterDeductions,
    mkbVrijstelling,
    belastbaarInkomen,
    taxIBBrutto: taxIB,
    heffingskorting,
    arbeidskorting,
    totalKortingen,
    netTaxIB,
    monthlyReserve: netTaxIB / 12,
    quarterlyReserve: netTaxIB / 4,
    rates
  };
}

function getBTWQuarter(year, quarter) {
  const db = getDb();
  const yearStr = String(year);

  const quarterMonths = {
    1: ['01', '02', '03'],
    2: ['04', '05', '06'],
    3: ['07', '08', '09'],
    4: ['10', '11', '12']
  };

  const months = quarterMonths[quarter] || [];
  if (!months.length) throw new Error('Ongeldig kwartaal');

  const monthPlaceholders = months.map(() => `strftime('%m', issue_date) = ?`).join(' OR ');
  const expenseMonthPlaceholders = months.map(() => `strftime('%m', date) = ?`).join(' OR ');

  // BTW collected on 21% invoices
  const revenueRow = db.prepare(`
    SELECT SUM(btw_amount) as btw_collected
    FROM invoices
    WHERE status IN ('paid', 'sent', 'overdue')
    AND strftime('%Y', issue_date) = ?
    AND (${monthPlaceholders})
    AND btw_reverse_charge = 0
  `).get(yearStr, ...months);

  // BTW paid on deductible expenses
  const expenseRow = db.prepare(`
    SELECT SUM(btw_amount) as btw_paid
    FROM expenses
    WHERE strftime('%Y', date) = ?
    AND (${expenseMonthPlaceholders})
    AND btw_deductible = 1
  `).get(yearStr, ...months);

  const btwCollected = revenueRow?.btw_collected || 0;
  const btwPaid = expenseRow?.btw_paid || 0;
  const btwDue = btwCollected - btwPaid;

  const deadlines = { 1: `${year}-04-30`, 2: `${year}-07-31`, 3: `${year}-10-31`, 4: `${year + 1}-01-31` };

  return {
    year,
    quarter,
    btwCollected,
    btwPaid,
    btwDue,
    deadline: deadlines[quarter],
    months
  };
}

module.exports = { calculate, getBTWQuarter, getRates, saveRates };
