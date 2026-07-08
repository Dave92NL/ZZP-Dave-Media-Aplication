// Ported 1:1 from zzp-manager/src/modules/invoices.js (calculateSubtotal + create()).
// BTW is calculated at the invoice level only, never per line item.

export function calculateSubtotal(items) {
  return items.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 1) * (Number(item.unit_price) || 0);
  }, 0);
}

export function calculateTotals(items, { btwRate, btwReverseCharge, exchangeRate = 1 }) {
  const subtotal = calculateSubtotal(items);
  const rate = Number(btwRate) || 0;
  const btwAmount = btwReverseCharge ? 0 : subtotal * (rate / 100);
  const total = subtotal + btwAmount;
  const totalEur = total / (Number(exchangeRate) || 1);
  return { subtotal, btwAmount, total, totalEur };
}
