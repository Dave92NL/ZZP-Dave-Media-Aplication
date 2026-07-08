'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

async function exportReport(type, format, params, outputPath) {
  const reports = require('./reports');
  const { year, month, quarter } = params || {};

  let data;
  if (type === 'monthly') data = reports.monthly(year, month);
  else if (type === 'quarterly') data = reports.quarterly(year, quarter);
  else if (type === 'annual') data = reports.annual(year);
  else throw new Error(`Nieznany typ raportu: ${type}`);

  if (format === 'csv') return exportCSV(data, type, outputPath);
  if (format === 'xlsx') return await exportExcel(data, type, outputPath);
  if (format === 'pdf') return await exportReportPDF(data, type, outputPath);

  throw new Error(`Nieznany format: ${format}`);
}

function exportCSV(data, type, outputPath) {
  const lines = [];

  if (type === 'monthly') {
    lines.push('Kategoria,Wartość EUR');
    lines.push(`Przychody łącznie (faktury opłacone),${data.totalIncome.toFixed(2)}`);
    lines.push(`Koszty łącznie,${data.totalExpenses.toFixed(2)}`);
    for (const cat of data.expensesByCategory || []) {
      lines.push(`  - ${cat.category},${cat.total.toFixed(2)}`);
    }
    lines.push(`Zysk netto,${data.netProfit.toFixed(2)}`);
    lines.push(`Godziny łącznie,${data.totalHours.toFixed(1)}`);
    lines.push(`Godziny billable,${data.billableHours.toFixed(1)}`);
  } else if (type === 'annual') {
    lines.push('Miesiąc,Przychody,Koszty,Zysk,Godziny');
    for (const m of data.months || []) {
      lines.push(`${m.month},${m.totalIncome.toFixed(2)},${m.totalExpenses.toFixed(2)},${m.netProfit.toFixed(2)},${m.totalHours.toFixed(1)}`);
    }
    lines.push(`SUMA,${data.totalIncome.toFixed(2)},${data.totalExpenses.toFixed(2)},${data.netProfit.toFixed(2)},${data.totalHours.toFixed(1)}`);
  }

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}

async function exportExcel(data, type, outputPath) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ZZP Manager';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Raport');

  const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } }, alignment: { horizontal: 'center' } };
  const totalStyle = { font: { bold: true }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } } };

  if (type === 'annual') {
    sheet.columns = [
      { header: 'Miesiąc', key: 'month', width: 12 },
      { header: 'Przychody (€)', key: 'income', width: 16 },
      { header: 'Koszty (€)', key: 'expenses', width: 14 },
      { header: 'Zysk netto (€)', key: 'profit', width: 16 },
      { header: 'Godziny', key: 'hours', width: 12 }
    ];

    sheet.getRow(1).eachCell(cell => { Object.assign(cell, headerStyle); });

    const monthNames = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

    for (const m of data.months || []) {
      sheet.addRow({
        month: monthNames[m.month - 1],
        income: m.totalIncome,
        expenses: m.totalExpenses,
        profit: m.netProfit,
        hours: m.totalHours
      });
    }

    // Total row
    const totalRow = sheet.addRow({
      month: 'SUMA',
      income: data.totalIncome,
      expenses: data.totalExpenses,
      profit: data.netProfit,
      hours: data.totalHours
    });
    totalRow.eachCell(cell => { Object.assign(cell, totalStyle); });

    // Format number columns
    ['B','C','D'].forEach(col => {
      sheet.getColumn(col).numFmt = '€#,##0.00';
    });
  } else if (type === 'monthly') {
    sheet.columns = [
      { header: 'Kategoria', key: 'category', width: 30 },
      { header: 'Wartość (€)', key: 'value', width: 16 }
    ];
    sheet.getRow(1).eachCell(cell => { Object.assign(cell, headerStyle); });

    const rows = [
      { category: 'PRZYCHODY', value: null },
      { category: 'Faktury (opłacone)', value: data.totalIncome },
      { category: 'Przychody łącznie', value: data.totalIncome },
      { category: '', value: null },
      { category: 'KOSZTY', value: null },
      ...(data.expensesByCategory || []).map(c => ({ category: c.category, value: c.total })),
      { category: 'Koszty łącznie', value: data.totalExpenses },
      { category: '', value: null },
      { category: 'ZYSK NETTO', value: data.netProfit }
    ];

    for (const r of rows) {
      const row = sheet.addRow(r);
      if (!r.value && r.category) {
        row.getCell('A').font = { bold: true };
      }
    }
  }

  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
}

async function exportReportPDF(data, type, outputPath) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const stream = fs.createWriteStream(outputPath);

  await new Promise((resolve, reject) => {
    doc.pipe(stream);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1a2e')
      .text('ZZP Manager — Raport', { align: 'center' });
    doc.moveDown(0.5);

    if (type === 'annual') {
      doc.font('Helvetica').fontSize(12).fillColor('#666')
        .text(`Rok: ${data.year}`, { align: 'center' });
      doc.moveDown();

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#333').text('Podsumowanie roczne');
      doc.moveDown(0.3);
      addKeyValue(doc, 'Przychody łącznie:', `€${data.totalIncome.toFixed(2)}`);
      addKeyValue(doc, 'Koszty łącznie:', `€${data.totalExpenses.toFixed(2)}`);
      addKeyValue(doc, 'Zysk netto:', `€${data.netProfit.toFixed(2)}`);
      addKeyValue(doc, 'Łączne godziny:', `${data.totalHours.toFixed(1)}h`);
    } else if (type === 'monthly') {
      const monthNames = ['','Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
      doc.font('Helvetica').fontSize(12).fillColor('#666')
        .text(`${monthNames[data.month]} ${data.year}`, { align: 'center' });
      doc.moveDown();

      addKeyValue(doc, 'Przychody łącznie (faktury opłacone):', `€${data.totalIncome.toFixed(2)}`);
      addKeyValue(doc, 'Koszty łącznie:', `€${data.totalExpenses.toFixed(2)}`);
      addKeyValue(doc, 'Zysk netto:', `€${data.netProfit.toFixed(2)}`);
      addKeyValue(doc, 'Godziny pracy:', `${data.totalHours.toFixed(1)}h`);
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return outputPath;
}

function addKeyValue(doc, key, value) {
  const y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor('#333').text(key, 50, y, { continued: false, width: 200 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111').text(value, 260, y, { width: 150 });
  doc.moveDown(0.4);
}

// ── W&V PDF Helpers ────────────────────────────────────────
function fmtAmtWV(amount) {
  const num = Number(amount) || 0;
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '€ ' + parts.join(',');
}

function formatDateNLwv(d) {
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}

// ── W&V PDF Generator ──────────────────────────────────────
async function generateWVPDF(year, win) {
  const reports   = require('./reports');
  const taxCalc   = require('./tax-calculator');
  const settings  = require('./settings');
  const { app }   = require('electron');

  const annualData = reports.annual(year);
  const taxData    = taxCalc.calculate(year);
  const profile    = settings.getProfile();

  // Build expense category totals across all months
  const catTotals = {};
  for (const m of annualData.months || []) {
    for (const c of m.expensesByCategory || []) {
      catTotals[c.category] = (catTotals[c.category] || 0) + c.total;
    }
  }
  const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  // Output path: userData/exports/WV-{year}-{ts}.pdf
  const exportsDir = path.join(app.getPath('userData'), 'exports');
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });
  const outputPath = path.join(exportsDir, `WV-${year}-${Date.now()}.pdf`);

  // PDF setup
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const stream = fs.createWriteStream(outputPath);

  const DARK   = '#1A1A2A';
  const GRAY   = '#555555';
  const LGRAY  = '#888888';
  const BORDER = '#CCCCCC';
  const ACCENT = '#2D6A8F';
  const M      = 45;
  const PW     = 595;
  const CW     = PW - M * 2;

  await new Promise((resolve, reject) => {
    doc.pipe(stream);

    // ── HEADER BAR ─────────────────────────────────────
    doc.rect(0, 0, PW, 75).fill(DARK);

    // Logo (if exists)
    if (profile.logo_path && fs.existsSync(profile.logo_path)) {
      try {
        doc.image(profile.logo_path, M, 12, { height: 48, fit: [110, 48] });
      } catch (_) { /* skip if image fails */ }
    }

    // Title
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#FFFFFF')
      .text('WINST- EN VERLIESREKENING', M, 18, { lineBreak: false });
    doc.font('Helvetica').fontSize(11).fillColor('#AAAACC')
      .text(`Boekjaar ${year}`, M, 44, { lineBreak: false });

    // Company name (right)
    const coName = profile.name || 'ZZP Manager';
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
      .text(coName, 0, 20, { align: 'right', width: PW - M, lineBreak: false });
    if (profile.kvk_number) {
      doc.font('Helvetica').fontSize(9).fillColor('#AAAACC')
        .text(`KVK ${profile.kvk_number}`, 0, 34, { align: 'right', width: PW - M, lineBreak: false });
    }
    if (profile.btw_number) {
      doc.font('Helvetica').fontSize(9).fillColor('#AAAACC')
        .text(`BTW ${profile.btw_number}`, 0, 47, { align: 'right', width: PW - M, lineBreak: false });
    }

    let y = 95;

    // ── Helper: section header ─────────────────────────
    function sectionHeader(title, color = DARK) {
      doc.rect(M, y, CW, 20).fill(color);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF')
        .text(title, M + 8, y + 6, { lineBreak: false });
      y += 26;
    }

    // ── Helper: data row ───────────────────────────────
    function dataRow(label, amount, indent = 0, bold = false, color = GRAY) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .fillColor(color)
        .text(label, M + indent, y, { lineBreak: false });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .fillColor(bold ? DARK : color)
        .text(fmtAmtWV(amount), 0, y, { align: 'right', width: PW - M, lineBreak: false });
      y += 15;
    }

    // ── Helper: separator line ─────────────────────────
    function hline(thick = false) {
      doc.moveTo(M, y).lineTo(M + CW, y)
        .strokeColor(thick ? DARK : BORDER)
        .lineWidth(thick ? 1 : 0.5)
        .stroke();
      y += thick ? 6 : 4;
    }

    // ── Helper: total row ──────────────────────────────
    function totalRow(label, amount, bgColor = '#F0F4F8') {
      doc.rect(M, y - 2, CW, 18).fill(bgColor);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
        .text(label, M + 6, y + 2, { lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK)
        .text(fmtAmtWV(amount), 0, y + 2, { align: 'right', width: PW - M, lineBreak: false });
      y += 22;
    }

    // ══════════════════════════════════════════════════
    // 1. OMZET
    // ══════════════════════════════════════════════════
    sectionHeader('1. OMZET (Bruto-omzet)', ACCENT);

    const totalInc = annualData.totalIncome || 0;

    dataRow('Factuuropbrengsten (betaald)', totalInc, 8);
    hline();
    y += 2;
    totalRow('TOTALE OMZET', totalInc);
    y += 6;

    // ══════════════════════════════════════════════════
    // 2. BEDRIJFSKOSTEN
    // ══════════════════════════════════════════════════
    sectionHeader('2. BEDRIJFSKOSTEN', ACCENT);

    const totalExp = annualData.totalExpenses || 0;

    for (const [cat, amt] of catEntries) {
      dataRow(cat, amt, 8);
      hline();
    }
    if (!catEntries.length) {
      dataRow('Geen kosten geregistreerd', 0, 8, false, LGRAY);
      hline();
    }
    y += 2;
    totalRow('TOTALE KOSTEN', totalExp);
    y += 6;

    // ══════════════════════════════════════════════════
    // 3. BRUTOBEDRIJFSRESULTAAT
    // ══════════════════════════════════════════════════
    const brutoResult = totalInc - totalExp;
    doc.rect(M, y - 2, CW, 22).fill(brutoResult >= 0 ? '#DFF4E8' : '#FDECEA');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
      .text('BRUTOBEDRIJFSRESULTAAT', M + 6, y + 3, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(brutoResult >= 0 ? '#1A7340' : '#B71C1C')
      .text(fmtAmtWV(brutoResult), 0, y + 3, { align: 'right', width: PW - M, lineBreak: false });
    y += 28;

    // ══════════════════════════════════════════════════
    // 4. AFTREKPOSTEN (only if meets urencriterium)
    // ══════════════════════════════════════════════════
    if (taxData.zelfstandigenaftrek > 0 || taxData.startersaftrek > 0 || taxData.mkbVrijstelling > 0) {
      sectionHeader('4. AFTREKPOSTEN (Ondernemersfaciliteiten)', ACCENT);

      if (taxData.zelfstandigenaftrek > 0) {
        dataRow('Zelfstandigenaftrek', taxData.zelfstandigenaftrek, 8);
        hline();
      }
      if (taxData.startersaftrek > 0) {
        dataRow('Startersaftrek', taxData.startersaftrek, 8);
        hline();
      }
      if (taxData.mkbVrijstelling > 0) {
        const mkbPct = (taxData.rates?.mkb_vrijstelling * 100 || 12.7).toFixed(1);
        dataRow(`MKB-winstvrijstelling (${mkbPct}%)`, taxData.mkbVrijstelling, 8);
        hline();
      }
      y += 2;
      const totalAftrek = (taxData.zelfstandigenaftrek || 0) + (taxData.startersaftrek || 0) + (taxData.mkbVrijstelling || 0);
      totalRow('TOTALE AFTREKPOSTEN', totalAftrek);
      y += 6;
    } else {
      y += 4;
      doc.font('Helvetica').fontSize(9).fillColor(LGRAY)
        .text('Geen aftrekposten (urencriterium niet behaald of niet van toepassing)', M, y, { lineBreak: false });
      y += 20;
    }

    // ══════════════════════════════════════════════════
    // 5. BELASTBARE WINST + GESCHATTE BELASTING
    // ══════════════════════════════════════════════════
    // Check if new page is needed
    if (y > 700) { doc.addPage(); y = 50; }

    hline(true);
    y += 4;

    doc.rect(M, y - 2, CW, 22).fill('#E8EFF6');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
      .text('BELASTBARE WINST', M + 6, y + 3, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
      .text(fmtAmtWV(taxData.belastbaarInkomen || 0), 0, y + 3, { align: 'right', width: PW - M, lineBreak: false });
    y += 28;

    sectionHeader('5. GESCHATTE INKOMSTENBELASTING', ACCENT);
    dataRow('Inkomstenbelasting (bruto)', taxData.taxIBBrutto || 0, 8);
    hline();
    if (taxData.heffingskorting > 0) {
      dataRow('Algemene heffingskorting', -(taxData.heffingskorting || 0), 8, false, '#1A7340');
      hline();
    }
    if (taxData.arbeidskorting > 0) {
      dataRow('Arbeidskorting', -(taxData.arbeidskorting || 0), 8, false, '#1A7340');
      hline();
    }
    y += 2;

    doc.rect(M, y - 2, CW, 22).fill('#E8EFF6');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK)
      .text('NETTO INKOMSTENBELASTING', M + 6, y + 3, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#B71C1C')
      .text(fmtAmtWV(taxData.netTaxIB || 0), 0, y + 3, { align: 'right', width: PW - M, lineBreak: false });
    y += 30;

    dataRow(`Maandelijkse reservering: ${fmtAmtWV(taxData.monthlyReserve || 0)} / mnd`, '', 8, false, LGRAY);
    dataRow(`Kwartaalreservering: ${fmtAmtWV(taxData.quarterlyReserve || 0)} / kwartaal`, '', 8, false, LGRAY);
    y += 8;

    // ── URENCRITERIUM INFO ─────────────────────────────
    hline(true);
    y += 6;
    const urenColor = taxData.meetsUrencriterium ? '#1A7340' : '#B71C1C';
    const urenIcon  = taxData.meetsUrencriterium ? '✓' : '✗';
    doc.font('Helvetica').fontSize(9).fillColor(LGRAY)
      .text('Urencriterium (1225 uren/jaar): ', M, y, { continued: true });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(urenColor)
      .text(`${urenIcon} ${taxData.totalHours.toFixed(0)} uren geregistreerd`, { lineBreak: false });
    y += 18;

    // ── FOOTER ─────────────────────────────────────────
    if (y < 790) {
      const footerY = 810;
      doc.moveTo(M, footerY).lineTo(M + CW, footerY).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
        .text(`Gegenereerd door ZZP Manager op ${formatDateNLwv(new Date())}`, M, footerY + 6, { lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(LGRAY)
        .text('Dit is een indicatief overzicht. Raadpleeg uw boekhouder voor officiële aangifte.', 0, footerY + 6, { align: 'right', width: PW - M, lineBreak: false });
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return outputPath;
}

module.exports = { exportReport, generateWVPDF };
