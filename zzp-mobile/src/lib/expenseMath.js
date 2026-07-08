// Ported 1:1 from zzp-manager/src/modules/expenses.js (create()) — amount is
// gross/inclusive, BTW is extracted out of it rather than added on top.

export function calculateExpense(amount, btwRate, exchangeRate = 1) {
  const amt = Number(amount) || 0;
  const rate = Number(btwRate) || 0;
  const btwAmount = amt * (rate / (100 + rate));
  const amountEur = amt / (Number(exchangeRate) || 1);
  return { btwAmount, amountEur };
}
