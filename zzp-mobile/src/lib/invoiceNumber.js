// Invoice numbering shared with the desktop app: format YYYY/NNNN (4-digit,
// zero-padded), continuing the SAME sequence as desktop-issued invoices —
// no separate mobile prefix. This only sees numbers the desktop has already
// pushed to Supabase, so the "Nowa faktura" screen reminds the user to sync
// desktop first if they've recently issued invoices there.
//
// Collision safety net: invoice_number has a UNIQUE constraint in Supabase.
// If two near-simultaneous inserts race, the losing insert gets a Postgres
// unique-violation error (code 23505); the caller should re-run
// generateNextInvoiceNumber() and retry the insert (see newInvoice.js).

export async function generateNextInvoiceNumber(supabase, year = new Date().getFullYear()) {
  const prefix = `${year}/`;
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('invoice_number', { ascending: false })
    .limit(1);

  if (error) throw new Error('Nie udało się pobrać numeru faktury: ' + error.message);

  let next = 1;
  if (data && data.length > 0) {
    const match = data[0].invoice_number.match(/\/(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }

  return `${prefix}${String(next).padStart(4, '0')}`;
}

export function isUniqueViolation(error) {
  return !!error && (error.code === '23505' || /duplicate key value/i.test(error.message || ''));
}
