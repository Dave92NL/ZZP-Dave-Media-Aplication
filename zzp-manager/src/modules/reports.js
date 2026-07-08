'use strict';

const { getDb } = require('../database/db');

function monthly(year, month) {
  const db = getDb();
  const y = String(year);
  const m = String(month).padStart(2, '0');

  // Income = paid invoices only (no AdSense/YouTube/other sources mixed in)
  const income = db.prepare(`
    SELECT SUM(total_eur) as total_income
    FROM invoices
    WHERE status = 'paid' AND strftime('%Y', paid_date) = ? AND strftime('%m', paid_date) = ?
  `).get(y, m);

  const expenses = db.prepare(`
    SELECT
      SUM(amount_eur) as total_expenses,
      SUM(CASE WHEN btw_deductible = 1 THEN btw_amount ELSE 0 END) as btw_deductible
    FROM expenses
    WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
  `).get(y, m);

  const expByCategory = db.prepare(`
    SELECT category, SUM(amount_eur) as total
    FROM expenses
    WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
    GROUP BY category ORDER BY total DESC
  `).all(y, m);

  const timeData = db.prepare(`
    SELECT
      SUM(duration_minutes) as total_minutes,
      SUM(CASE WHEN is_billable = 1 THEN duration_minutes ELSE 0 END) as billable_minutes
    FROM time_entries
    WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
  `).get(y, m);

  const totalIncome = income?.total_income || 0;
  const totalExpenses = expenses?.total_expenses || 0;
  const netProfit = totalIncome - totalExpenses;

  return {
    year, month,
    totalIncome,
    totalExpenses,
    btwDeductible: expenses?.btw_deductible || 0,
    expensesByCategory: expByCategory,
    netProfit,
    margin: totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0,
    totalMinutes: timeData?.total_minutes || 0,
    totalHours: (timeData?.total_minutes || 0) / 60,
    billableMinutes: timeData?.billable_minutes || 0,
    billableHours: (timeData?.billable_minutes || 0) / 60
  };
}

function quarterly(year, quarter) {
  const quarterMonths = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] };
  const months = quarterMonths[quarter] || [];

  const monthlyData = months.map(m => monthly(year, m));

  return {
    year, quarter,
    months: monthlyData,
    totalIncome: sum(monthlyData, 'totalIncome'),
    totalExpenses: sum(monthlyData, 'totalExpenses'),
    netProfit: sum(monthlyData, 'netProfit'),
    totalHours: sum(monthlyData, 'totalHours')
  };
}

function annual(year) {
  const db = getDb();
  const y = String(year);

  const monthlyData = Array.from({ length: 12 }, (_, i) => monthly(year, i + 1));

  const timeByCategory = db.prepare(`
    SELECT category, SUM(duration_minutes) as minutes
    FROM time_entries WHERE strftime('%Y', date) = ?
    GROUP BY category ORDER BY minutes DESC
  `).all(y);

  return {
    year,
    months: monthlyData,
    totalIncome: sum(monthlyData, 'totalIncome'),
    totalExpenses: sum(monthlyData, 'totalExpenses'),
    netProfit: sum(monthlyData, 'netProfit'),
    totalHours: sum(monthlyData, 'totalHours'),
    billableHours: sum(monthlyData, 'billableHours'),
    timeByCategory
  };
}

function yearOverYear(year1, year2) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const data1 = months.map(m => ({ month: m, ...monthly(year1, m) }));
  const data2 = months.map(m => ({ month: m, ...monthly(year2, m) }));

  return {
    year1, year2,
    months: months.map((m, i) => ({
      month: m,
      income1: data1[i].totalIncome,
      income2: data2[i].totalIncome,
      expenses1: data1[i].totalExpenses,
      expenses2: data2[i].totalExpenses,
      profit1: data1[i].netProfit,
      profit2: data2[i].netProfit
    })),
    totals: {
      income1: sum(data1, 'totalIncome'),
      income2: sum(data2, 'totalIncome'),
      expenses1: sum(data1, 'totalExpenses'),
      expenses2: sum(data2, 'totalExpenses'),
      profit1: sum(data1, 'netProfit'),
      profit2: sum(data2, 'netProfit')
    }
  };
}

function getIncomeEntries(filters = {}) {
  const db = getDb();
  let where = [];
  const params = [];

  if (filters.year) { where.push("strftime('%Y', date) = ?"); params.push(String(filters.year)); }
  if (filters.month) { where.push("strftime('%m', date) = ?"); params.push(String(filters.month).padStart(2,'0')); }
  if (filters.source) { where.push('source = ?'); params.push(filters.source); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return db.prepare(`SELECT * FROM income_entries ${whereStr} ORDER BY date DESC`).all(...params);
}

function createIncomeEntry(data) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO income_entries (source, description, amount, currency, exchange_rate, amount_eur, date, invoice_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.source || 'Other',
    data.description || '',
    Number(data.amount) || 0,
    data.currency || 'EUR',
    Number(data.exchange_rate) || 1,
    Number(data.amount_eur) || Number(data.amount) || 0,
    data.date,
    data.invoice_id || null
  );
  return { id: result.lastInsertRowid };
}

function deleteIncomeEntry(id) {
  const db = getDb();
  db.prepare('DELETE FROM income_entries WHERE id = ?').run(id);
  return { success: true };
}

function sum(arr, key) {
  return arr.reduce((acc, obj) => acc + (obj[key] || 0), 0);
}

module.exports = { monthly, quarterly, annual, yearOverYear, getIncomeEntries, createIncomeEntry, deleteIncomeEntry };
