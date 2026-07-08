'use strict';

/**
 * efaktura-import.js
 *
 * Imports invoices and expenses from efaktura.nl exports:
 *   - XML: Peppol BIS 3.0 / UBL 2.1 format
 *   - PDF: text extraction via pdf-parse (best-effort)
 *
 * Entry points:
 *   parseFiles(filePaths, type)     — analyse files, return preview data
 *   importInvoices(parsedItems)     — write invoices to DB
 *   importExpenses(parsedItems)     — write expenses to DB
 */

const fs   = require('fs');
const path = require('path');
const { getDb } = require('../database/db');

// ── XML Parser ─────────────────────────────────────────────────────────────

let _xmlParser = null;
function getXMLParser() {
  if (!_xmlParser) {
    const { XMLParser } = require('fast-xml-parser');
    _xmlParser = new XMLParser({
      ignoreAttributes:  false,
      attributeNamePrefix: '@_',
      removeNSPrefix:    true,   // strips cbc: / cac: prefixes → clean keys
      parseTagValue:     true,   // auto-converts numbers/booleans
      isArray: (name) => ['InvoiceLine', 'TaxSubtotal', 'AdditionalDocumentReference'].includes(name)
    });
  }
  return _xmlParser;
}

// ── Public: analyse files ─────────────────────────────────────────────────

/**
 * Parses an array of XML/PDF file paths.
 * type: 'invoice' | 'expense'
 * Returns: Array<{ file, basename, status, data, error }>
 *   status: 'ok' | 'warn' | 'error' | 'skipped'
 *   data: parsed record ready for import (may have nulls for warn/skipped)
 */
async function parseFiles(filePaths, type) {
  const results = [];

  // Build a set of numeric prefixes for XML files in this batch.
  // e.g. "300267_2_fa0133077.xml" → prefix "300267"
  // Used to auto-skip companion PDFs when a better XML counterpart was selected.
  const xmlPrefixes = new Set();
  for (const fp of filePaths) {
    if (path.extname(fp).toLowerCase() === '.xml') {
      const prefix = _numericPrefix(path.basename(fp));
      if (prefix) xmlPrefixes.add(prefix);
    }
  }

  for (const fp of filePaths) {
    try {
      const ext = path.extname(fp).toLowerCase();

      // Auto-pair: if this PDF shares a numeric prefix with an XML in the same
      // batch, skip it — the XML will be parsed and carries richer data.
      if (ext === '.pdf') {
        const prefix = _numericPrefix(path.basename(fp));
        if (prefix && xmlPrefixes.has(prefix)) {
          results.push({
            file:        fp,
            basename:    path.basename(fp),
            status:      'skipped',
            data:        null,
            warnings:    [],
            error:       null,
            _skipReason: 'Plik XML z tym samym numerem zostanie użyty zamiast PDF'
          });
          continue;
        }
      }

      let data;
      if (ext === '.xml') {
        data = await parseXML(fp, type);
      } else if (ext === '.pdf') {
        data = await parsePDF(fp, type);
      } else {
        results.push({ file: fp, basename: path.basename(fp), status: 'error', data: null, error: 'Nieobsługiwany format pliku (tylko .xml i .pdf)' });
        continue;
      }

      const warnings = _collectWarnings(data, type);
      results.push({
        file:     fp,
        basename: path.basename(fp),
        status:   warnings.length > 0 ? 'warn' : 'ok',
        data,
        warnings,
        error:    null
      });
    } catch (err) {
      results.push({ file: fp, basename: path.basename(fp), status: 'error', data: null, error: err.message });
    }
  }
  return results;
}

/** Extracts the leading numeric string from a filename, e.g. "300267_1_abc.pdf" → "300267" */
function _numericPrefix(basename) {
  const m = basename.match(/^(\d+)/);
  return m ? m[1] : null;
}

// ── XML Parsing ───────────────────────────────────────────────────────────

async function parseXML(filePath, type) {
  const xml  = fs.readFileSync(filePath, 'utf-8');
  const parser = getXMLParser();
  const root   = parser.parse(xml);

  // The top-level element can be 'Invoice' or 'CreditNote'
  const inv = root.Invoice || root.CreditNote || root['ubl:Invoice'] || Object.values(root)[0];
  if (!inv) throw new Error('Nierozpoznana struktura XML (brak elementu Invoice)');

  if (type === 'invoice') return _mapUBLToInvoice(inv);
  if (type === 'expense') return _mapUBLToExpense(inv);
  throw new Error('Nieznany typ: ' + type);
}

// ── UBL → Invoice ─────────────────────────────────────────────────────────

function _mapUBLToInvoice(inv) {
  // ── Invoice number
  const invoiceNumber = String(inv.ID || '').trim();

  // ── Dates
  const issueDate = _toDate(inv.IssueDate);
  const dueDate   = _toDate(
    inv.DueDate ||
    inv.PaymentMeans?.PaymentDueDate ||
    (Array.isArray(inv.PaymentMeans) ? inv.PaymentMeans[0]?.PaymentDueDate : null)
  );

  // ── Customer (AccountingCustomerParty)
  const customer = _extractParty(inv.AccountingCustomerParty?.Party || inv.AccountingCustomerParty);
  const supplier = _extractParty(inv.AccountingSupplierParty?.Party || inv.AccountingSupplierParty);

  // ── Currency
  const currency = String(inv.DocumentCurrencyCode || 'EUR').trim();

  // ── BTW rate (from first TaxSubtotal)
  const taxTotal   = Array.isArray(inv.TaxTotal) ? inv.TaxTotal[0] : inv.TaxTotal;
  const taxSubs    = taxTotal?.TaxSubtotal || [];
  const firstSub   = Array.isArray(taxSubs) ? taxSubs[0] : taxSubs;
  const btwRate    = _numVal(firstSub?.TaxCategory?.Percent);
  const btwReverse = (firstSub?.TaxCategory?.ID === 'AE') || (firstSub?.TaxCategory?.ID === 'Z') || (inv.TaxTotal == null && btwRate === 0);

  // ── Totals for reference  (UBL amounts have currency attributes: {#text, @_currencyID})
  const monetary   = inv.LegalMonetaryTotal || {};
  const totalIncl  = _numVal(monetary.TaxInclusiveAmount ?? monetary.PayableAmount);
  const totalExcl  = _numVal(monetary.TaxExclusiveAmount ?? monetary.LineExtensionAmount);

  // ── Line items
  const lines = Array.isArray(inv.InvoiceLine) ? inv.InvoiceLine : (inv.InvoiceLine ? [inv.InvoiceLine] : []);
  const items = lines.map((line, i) => {
    const qty       = _numVal(line.InvoicedQuantity) || 1;
    const lineTotal = _numVal(line.LineExtensionAmount);
    const price     = _numVal(line.Price?.PriceAmount) || (qty !== 0 ? lineTotal / qty : 0);
    const desc      = String(line.Item?.Name || line.Item?.Description || `Pozycja ${i + 1}`).trim();
    const unit      = String(line.InvoicedQuantity?.['@_unitCode'] || 'szt').trim();
    const lineBtw   = _numVal(line.Item?.ClassifiedTaxCategory?.Percent ?? line.TaxTotal?.TaxSubtotal?.TaxCategory?.Percent ?? btwRate);
    return { description: desc, quantity: qty, unit, unit_price: price, btw_rate: lineBtw };
  });

  // If no line items in XML, create one synthetic item from totals
  if (items.length === 0 && totalExcl > 0) {
    items.push({ description: `Import: ${invoiceNumber}`, quantity: 1, unit: 'szt', unit_price: totalExcl, btw_rate: btwRate });
  }

  return {
    invoice_number: invoiceNumber,
    issue_date:     issueDate,
    due_date:       dueDate || issueDate,
    currency,
    btw_rate:       btwRate,
    btw_reverse_charge: btwReverse ? 1 : 0,
    // 'paid' by default for historical import — paid_date = issue_date keeps income in correct month
    status:         'paid',
    paid_date:      issueDate,
    notes:          String(inv.Note || '').trim(),
    // Client info (will be resolved to client_id during import)
    _clientName:    customer.name,
    _clientVat:     customer.vat,
    _clientAddress: customer.address,
    _clientCity:    customer.city,
    _clientPostcode:customer.postcode,
    _clientCountry: customer.country,
    _clientEmail:   customer.email,
    // Reference totals for display
    _totalIncl:     totalIncl,
    _totalExcl:     totalExcl,
    items,
    source: 'xml'
  };
}

// ── UBL → Expense ─────────────────────────────────────────────────────────

function _mapUBLToExpense(inv) {
  const issueDate = _toDate(inv.IssueDate);
  const supplier  = _extractParty(inv.AccountingSupplierParty?.Party || inv.AccountingSupplierParty);

  const monetary  = inv.LegalMonetaryTotal || {};
  const totalIncl = _numVal(monetary.TaxInclusiveAmount ?? monetary.PayableAmount);

  const taxTotal  = Array.isArray(inv.TaxTotal) ? inv.TaxTotal[0] : inv.TaxTotal;
  const taxSubs   = taxTotal?.TaxSubtotal || [];
  const firstSub  = Array.isArray(taxSubs) ? taxSubs[0] : taxSubs;
  const btwRate   = _numVal(firstSub?.TaxCategory?.Percent);

  // First line description for expense description
  const lines = Array.isArray(inv.InvoiceLine) ? inv.InvoiceLine : (inv.InvoiceLine ? [inv.InvoiceLine] : []);
  const firstDesc = lines.length > 0
    ? String(lines[0].Item?.Name || lines[0].Item?.Description || '').trim()
    : '';

  const invoiceRef = String(inv.ID || '').trim();
  const description = firstDesc || (invoiceRef ? `Factuur ${invoiceRef}` : supplier.name || 'Import z efaktura.nl');

  return {
    date:        issueDate,
    vendor:      supplier.name || supplier.company || '',
    description,
    amount:      totalIncl,
    currency:    String(inv.DocumentCurrencyCode || 'EUR').trim(),
    btw_rate:    btwRate,
    btw_deductible: 1,
    is_deductible:  1,
    category:    'Inne',   // user can edit after import
    notes:       String(inv.Note || invoiceRef ? `Ref: ${invoiceRef}` : '').trim(),
    source: 'xml'
  };
}

// ── PDF Parsing ───────────────────────────────────────────────────────────

async function parsePDF(filePath, type) {
  // pdf-parse v1 — pass {version:'v1.10.100'} to skip internal test-file read
  const pdfParse = require('pdf-parse');
  const basename = path.basename(filePath);
  let text = '';

  try {
    const buffer  = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer, { version: 'v1.10.100' });
    text = pdfData.text || '';
  } catch (_) {
    // pdf-parse itself failed (encrypted, corrupted) → fall through to scanned-image fallback
  }

  // Scanned image / no text layer → return manual placeholder instead of hard error
  if (!text.trim()) {
    return _scannedPDFFallback(basename, type);
  }

  if (type === 'invoice') return _parsePDFInvoice(text, basename);
  if (type === 'expense') return _parsePDFExpense(text, basename);
  throw new Error('Nieznany typ: ' + type);
}

/**
 * Fallback for scanned PDFs (no text layer / photos of receipts).
 * Returns a record with description from filename and amount=0
 * so the user can import the placeholder and fill in details manually.
 */
function _scannedPDFFallback(basename, type) {
  // Try to extract a human-readable name from filename
  // e.g. "303212_Monitor ASUS.pdf" → "Monitor ASUS"
  //      "312443_Factuur Elgato.pdf" → "Factuur Elgato"
  const nameWithoutExt = path.basename(basename, path.extname(basename));
  const humanName = nameWithoutExt
    .replace(/^\d+_?\d*_?/, '')   // strip leading numeric prefix like "303212_1_"
    .replace(/_/g, ' ')
    .trim() || nameWithoutExt;

  if (type === 'invoice') {
    return {
      invoice_number: humanName,
      issue_date:     _todayStr(),
      due_date:       _todayStr(),
      currency:       'EUR',
      btw_rate:       0,
      btw_reverse_charge: 0,
      status:         'sent',
      paid_date:      null,
      notes:          `Import z PDF (skan) — uzupełnij ręcznie`,
      _clientName:    '',
      _clientVat:     '',
      _clientAddress: '',
      _clientCity:    '',
      _clientPostcode:'',
      _clientCountry: 'NL',
      _clientEmail:   '',
      _totalIncl:     0,
      _totalExcl:     0,
      items:          [],
      source:         'pdf_scan',
      _scanned:       true
    };
  }

  // type === 'expense'
  return {
    date:           _todayStr(),
    vendor:         humanName,
    description:    humanName,
    amount:         0,
    currency:       'EUR',
    btw_rate:       21,
    btw_deductible: 1,
    is_deductible:  1,
    category:       'Inne',
    notes:          `Import z PDF (skan) — uzupełnij kwotę i datę ręcznie`,
    source:         'pdf_scan',
    _scanned:       true
  };
}

function _parsePDFInvoice(text, filename) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const invoiceNumber = _rxFind(text, [
    /(?:factuurnummer|invoice\s*(?:no|number|nr))[:\s]+([^\s\n,]+)/i,
    /(?:faktura|faktuur)\s+(?:nr\.?|no\.?)[:\s]+([^\s\n,]+)/i
  ]) || path.basename(filename, path.extname(filename));

  const issueDate = _rxFindDate(text, [
    /(?:factuurdatum|invoice\s*date|datum)[:\s]+(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
    /(?:datum|date)[:\s]+(\d{4}-\d{2}-\d{2})/i
  ]);

  const dueDate = _rxFindDate(text, [
    /(?:vervaldatum|due\s*date|betaal.*datum)[:\s]+(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i
  ]) || issueDate;

  const totalIncl = _rxFindAmount(text, [
    /(?:te\s+betalen|totaal\s+incl(?:usief)?|total\s+incl|payable)[^\n€$\d]*([\d.,]+)/i,
    // Negative lookahead: "Totaal" NOT followed by "excl" handles "Totaal15.11 EUR" (no space)
    /totaal(?!\s*excl)[^\n€$\d]*([\d.,]+)/i,
    /total(?!\s*excl)[^\n€$\d]*([\d.,]+)/i
  ]);

  const totalExcl = _rxFindAmount(text, [
    /(?:subtotaal|totaal\s+excl(?:l?\.?\s*btw)?|subtotal|excl\.?\s*btw)[^\n€$\d]*([\d.,]+)/i
  ]);

  const btwRate = _rxFindNumber(text, [
    /btw[^%\d]*(\d{1,2})\s*%/i,
    /vat[^%\d]*(\d{1,2})\s*%/i
  ]) || 21;

  // Try to find client name (text after "Aan:" / "To:" / "Klant:")
  const clientName = _rxFind(text, [
    /(?:aan|to|klant|client|buyer)[:\s]+([^\n]+)/i
  ]) || '';

  const price = totalExcl || (totalIncl > 0 ? totalIncl / (1 + btwRate / 100) : 0);

  return {
    invoice_number: String(invoiceNumber).trim(),
    issue_date:     issueDate || _todayStr(),
    due_date:       dueDate   || _todayStr(),
    currency:       'EUR',
    btw_rate:       btwRate,
    btw_reverse_charge: 0,
    status:         'sent',
    notes:          '',
    _clientName:    String(clientName).trim(),
    _clientVat:     '',
    _clientAddress: '',
    _clientCity:    '',
    _clientPostcode:'',
    _clientCountry: 'NL',
    _clientEmail:   '',
    _totalIncl:     totalIncl || 0,
    items: price > 0 ? [{ description: `Import PDF: ${invoiceNumber}`, quantity: 1, unit: 'szt', unit_price: price, btw_rate: btwRate }] : [],
    source: 'pdf'
  };
}

function _parsePDFExpense(text, filename) {
  const issueDate = _rxFindDate(text, [
    /(?:factuurdatum|datum|date)[:\s]+(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i,
    /(?:datum|date)[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/
  ]);

  // Try explicit inclusive-total labels first, then "Totaal" with negative
  // lookahead so "Totaal excl. btw12.49" is not mistaken for the payable amount.
  // Also handles "Totaal15.11" (no space between label and number).
  const totalIncl = _rxFindAmount(text, [
    /(?:te\s+betalen|totaal\s+incl(?:usief)?|total\s+incl|payable)[^\n€$\d]*([\d.,]+)/i,
    /totaal(?!\s*excl)[^\n€$\d]*([\d.,]+)/i,
    /total(?!\s*excl)[^\n€$\d]*([\d.,]+)/i
  ]);

  const btwRate = _rxFindNumber(text, [
    /btw[^%\d]*(\d{1,2}(?:[,.]\d+)?)\s*%/i,
    /vat[^%\d]*(\d{1,2})\s*%/i
  ]) || 21;

  const invoiceRef = _rxFind(text, [
    /(?:factuurnummer|invoice\s*(?:no|nr))[:\s]+([^\s\n,]+)/i
  ]) || path.basename(filename, path.extname(filename));

  // ── Vendor detection ──────────────────────────────────────────────────────
  // Skip common document-header words, metadata labels, ALL-CAPS concatenated
  // table headers (e.g. "ARTIKELAANTALPRIJSTOTAAL"), and pure-number lines.
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const VENDOR_SKIP = /^(?:factuur|invoice|rekening|nota|receipt|bon|factuurnummer|factuurdatum|datum|date|btw|vat|iban|kvk|kamer(?:van)?|totaal|subtotaal|bedrag|omschrijving|artikel|product|leverancier|supplier|opdrachtgever|betalings)/i;

  // Prefer lines that look like a company name (contain B.V., N.V., Ltd, etc.)
  const COMPANY_MARKER = /\b(b\.?v\.?|n\.?v\.?|ltd\.?|gmbh|s\.?a\.?r?\.?l?\.?|inc\.?|bvba|sprl|llc)\b/i;
  const vendorLine =
    lines.find(l => COMPANY_MARKER.test(l) && !VENDOR_SKIP.test(l) && !/^[A-Z]{10,}$/.test(l)) ||
    lines.find(l =>
      l.length > 3 &&
      !VENDOR_SKIP.test(l) &&
      !/^[A-Z]{8,}$/.test(l) &&     // skip long ALL-CAPS (concatenated headers)
      !/^[\d€\s.,\-/]+$/.test(l)    // skip lines that are only numbers/amounts
    ) || '';

  return {
    date:        issueDate || _todayStr(),
    vendor:      vendorLine.slice(0, 100),
    description: invoiceRef ? `Factuur ${invoiceRef}` : 'Import PDF',
    amount:      totalIncl || 0,
    currency:    'EUR',
    btw_rate:    btwRate,
    btw_deductible: 1,
    is_deductible:  1,
    category:    'Inne',
    notes:       invoiceRef ? `Ref: ${invoiceRef}` : '',
    source: 'pdf'
  };
}

// ── Public: Import invoices ───────────────────────────────────────────────

async function importInvoices(parsedItems) {
  const db = getDb();
  const invoices = require('./invoices');

  let imported = 0;
  let skipped  = 0;
  const errors = [];

  for (const item of parsedItems) {
    if (!item || item.status === 'error' || !item.data) { skipped++; continue; }
    const d = item.data;
    try {
      // Resolve client
      const clientId = d._clientName
        ? _findOrCreateClient(db, {
            name:     d._clientName,
            vat:      d._clientVat,
            address:  d._clientAddress,
            city:     d._clientCity,
            postcode: d._clientPostcode,
            country:  d._clientCountry,
            email:    d._clientEmail
          })
        : null;

      await invoices.create({
        invoice_number:    d.invoice_number || undefined,
        client_id:         clientId,
        status:            d.status || 'paid',
        paid_date:         d.paid_date || d.issue_date,
        issue_date:        d.issue_date,
        due_date:          d.due_date,
        currency:          d.currency || 'EUR',
        btw_rate:          d.btw_rate || 0,
        btw_reverse_charge:d.btw_reverse_charge || 0,
        notes:             d.notes || '',
        items:             d.items || []
      });
      imported++;
    } catch (err) {
      // Invoice number already exists → fix it in-place (update status + income_entry date)
      if (/al istnieje|already exist/i.test(err.message) && d.invoice_number) {
        try {
          _fixExistingInvoice(db, d);
          imported++; // counts as updated
        } catch (fixErr) {
          errors.push({ file: item.basename, error: fixErr.message });
          skipped++;
        }
      } else {
        errors.push({ file: item.basename, error: err.message });
        skipped++;
      }
    }
  }

  return { imported, skipped, errors };
}

// ── Public: Import expenses ───────────────────────────────────────────────

async function importExpenses(parsedItems) {
  const expenses = require('./expenses');

  let imported = 0;
  let skipped  = 0;
  const errors = [];

  for (const item of parsedItems) {
    if (!item || item.status === 'error' || !item.data) { skipped++; continue; }
    const d = item.data;
    try {
      // Scanned PDFs: allow amount=0 (user fills in manually after import)
      // Non-scanned: require non-zero amount
      if (!d.date && !d._scanned) {
        errors.push({ file: item.basename, error: 'Brak daty — pomiń i dodaj ręcznie' });
        skipped++;
        continue;
      }
      await expenses.create({
        category:       d.category || 'Inne',
        description:    d.description || item.basename,
        amount:         d.amount,
        currency:       d.currency || 'EUR',
        btw_rate:       d.btw_rate || 0,
        btw_deductible: d.btw_deductible !== false ? 1 : 0,
        date:           d.date,
        vendor:         d.vendor || '',
        is_deductible:  d.is_deductible !== false ? 1 : 0,
        notes:          d.notes || ''
      });
      imported++;
    } catch (err) {
      errors.push({ file: item.basename, error: err.message });
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

// ── Fix existing invoice: update to paid + correct income_entry date ──────

function _fixExistingInvoice(db, d) {
  const inv = db.prepare('SELECT id, total, total_eur, currency, exchange_rate, client_id, invoice_number FROM invoices WHERE invoice_number = ?').get(d.invoice_number);
  if (!inv) return;

  const paidDate = d.paid_date || d.issue_date;
  const status   = d.status || 'paid';

  // Update invoice status & paid_date
  db.prepare(`UPDATE invoices SET status = ?, paid_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(status, paidDate, inv.id);

  if (status === 'paid' && inv.total > 0) {
    // Remove old income_entry (if any) and re-insert with correct date
    db.prepare('DELETE FROM income_entries WHERE invoice_id = ?').run(inv.id);

    // Determine source: AdSense for Google Ireland Limited, else Invoice
    const client = inv.client_id
      ? db.prepare('SELECT name, company_name FROM clients WHERE id = ?').get(inv.client_id)
      : null;
    const clientName = (client?.company_name || client?.name || '').toLowerCase();
    const source = clientName.includes('google ireland') ? 'AdSense' : 'Invoice';

    db.prepare(`
      INSERT INTO income_entries (source, description, amount, currency, exchange_rate, amount_eur, date, invoice_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      source,
      `Factuur ${inv.invoice_number}`,
      inv.total, inv.currency || 'EUR', inv.exchange_rate || 1,
      inv.total_eur || inv.total,
      paidDate,
      inv.id
    );
  }
}

// ── Client lookup / create ────────────────────────────────────────────────

function _findOrCreateClient(db, clientData) {
  const { name, vat, address, city, postcode, country, email } = clientData;
  if (!name) return null;

  // 1. Lookup by VAT number (most reliable)
  if (vat) {
    const byVat = db.prepare('SELECT id FROM clients WHERE LOWER(vat_number) = LOWER(?) LIMIT 1').get(vat.trim());
    if (byVat) return byVat.id;
  }

  // 2. Lookup by company name (case-insensitive)
  const nameNorm = name.trim().toLowerCase();
  const byName = db.prepare(`
    SELECT id FROM clients
    WHERE LOWER(COALESCE(company_name, name)) = ? OR LOWER(name) = ?
    LIMIT 1
  `).get(nameNorm, nameNorm);
  if (byName) return byName.id;

  // 3. Create new client
  const result = db.prepare(`
    INSERT INTO clients (name, company_name, vat_number, address, city, postcode, country, email, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(
    name.trim(),
    name.trim(),
    vat  || '',
    address  || '',
    city     || '',
    postcode || '',
    country  || 'NL',
    email    || ''
  );
  return result.lastInsertRowid;
}

// ── UBL party extractor ───────────────────────────────────────────────────

function _extractParty(party) {
  if (!party) return { name: '', company: '', vat: '', address: '', city: '', postcode: '', country: '', email: '' };

  // Name: try multiple paths
  const name =
    String(party.PartyLegalEntity?.RegistrationName || '')      .trim() ||
    String(party.PartyName?.Name || '')                          .trim() ||
    String(party.PartyLegalEntity?.CompanyID || '')              .trim() ||
    '';

  // VAT number
  const taxScheme = Array.isArray(party.PartyTaxScheme)
    ? party.PartyTaxScheme[0]
    : party.PartyTaxScheme;
  const vat = String(taxScheme?.CompanyID || party.EndpointID || '').trim();

  // Address
  const addr    = party.PostalAddress || {};
  const address = String(addr.StreetName || addr.AddressLine?.Line || '').trim();
  const city    = String(addr.CityName || '').trim();
  const postcode= String(addr.PostalZone || '').trim();
  const country = String(addr.Country?.IdentificationCode || addr.Country || 'NL').trim();

  // Email
  const contact = Array.isArray(party.Contact) ? party.Contact[0] : party.Contact;
  const email   = String(contact?.ElectronicMail || party.ElectronicMail || '').trim();

  return { name, company: name, vat, address, city, postcode, country, email };
}

// ── Validation / warnings ─────────────────────────────────────────────────

function _collectWarnings(data, type) {
  const warnings = [];
  if (data._scanned) {
    warnings.push('Skan/zdjęcie — brak tekstu w PDF. Uzupełnij kwotę i datę po imporcie.');
    return warnings; // no further checks needed
  }
  if (type === 'invoice') {
    if (!data.issue_date) warnings.push('Brak daty wystawienia');
    if (!data.invoice_number) warnings.push('Brak numeru faktury');
    if (!data._clientName)   warnings.push('Brak danych klienta');
    if (!data.items?.length) warnings.push('Brak pozycji faktury');
    if (data.source === 'pdf') warnings.push('Import z PDF — sprawdź dane');
  }
  if (type === 'expense') {
    if (!data.date)   warnings.push('Brak daty');
    if (!data.amount || data.amount <= 0) warnings.push('Kwota = 0 — uzupełnij po imporcie');
    if (data.source === 'pdf') warnings.push('Import z PDF — sprawdź dane');
  }
  return warnings;
}

// ── Date / number helpers ─────────────────────────────────────────────────

/**
 * UBL monetary amounts look like:  { '#text': 2097.91, '@_currencyID': 'EUR' }
 * Plain values (no attributes) are just numbers.
 * This helper extracts the numeric value from either form.
 */
function _numVal(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && '#text' in v) return Number(v['#text']) || 0;
  return Number(v) || 0;
}

function _toDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  // YYYY-MM-DD (standard UBL)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-YYYY or DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // YYYYMMDD
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

function _todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function _rxFind(text, patterns) {
  for (const rx of patterns) {
    const m = text.match(rx);
    if (m) return m[1].trim();
  }
  return null;
}

function _rxFindDate(text, patterns) {
  const raw = _rxFind(text, patterns);
  if (!raw) return null;
  return _toDate(raw) || _toDate(raw.replace(/\//g, '-'));
}

function _rxFindAmount(text, patterns) {
  const raw = _rxFind(text, patterns);
  if (!raw) return null;
  // Handle European (1.234,56) and US (1,234.56) formats
  const cleaned = raw.replace(/[€$£\s]/g, '');
  if (/,\d{2}$/.test(cleaned)) {
    // European: dots = thousands, comma = decimal
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  return parseFloat(cleaned.replace(/,/g, ''));
}

function _rxFindNumber(text, patterns) {
  const raw = _rxFind(text, patterns);
  return raw ? Number(raw) : null;
}

module.exports = { parseFiles, importInvoices, importExpenses };
