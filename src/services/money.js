// Toujours travailler en cents (entiers). Format string uniquement à l'affichage.

export const toCents = (n) => Math.round(Number(n) * 100);
export const fromCents = (c) => (c / 100).toFixed(2);

const STRICT_TOTALS = process.env.STRICT_TOTALS !== 'false';

export function computeTotals(orderData) {
  const lines = (orderData.items || []).map((i) => {
    const unitCents = toCents(i.price);
    const qty = Number(i.quantity);
    return {
      name: i.name || 'Produit',
      qty,
      unitCents,
      lineCents: unitCents * qty,
    };
  });

  const itemsCents = lines.reduce((s, l) => s + l.lineCents, 0);
  const shippingCents = toCents(orderData.shippingCost ?? 5.9);

  const expectedCents = itemsCents + shippingCents;
  const declaredCents =
    orderData.totalAmount != null ? toCents(orderData.totalAmount) : expectedCents;

  // Tolérance 1 centime pour absorber un arrondi côté caller
  const diffCents = declaredCents - expectedCents;

  if (STRICT_TOTALS && Math.abs(diffCents) > 1) {
    const err = new Error(
      `Total incohérent: déclaré=${fromCents(declaredCents)} attendu=${fromCents(expectedCents)}`
    );
    err.code = 'TOTAL_MISMATCH';
    throw err;
  }

  return {
    lines,
    itemsCents,
    shippingCents,
    totalCents: declaredCents,
  };
}
