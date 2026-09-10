/**
 * The two halves of the moving-average purchase cost an item carries.
 *
 * `Item.avgPurchasePrice` is not a lifetime average of everything ever
 * bought — it is the cost of what is *on hand*, which is why the stock
 * report can multiply it by `currentStock` and get a valuation. Selling
 * leaves it alone (units go out at the average they came to be worth);
 * buying pulls it towards the new price.
 *
 * The arithmetic lived inline in three places — the purchase-invoice line
 * loop, quick purchase, and nowhere at all for reversals, which is how an
 * edited or deleted invoice used to leave the figure standing at a price
 * the warehouse no longer paid.
 */

interface Movement {
  /** The average before the movement. */
  avg: number;
  /** The stock before the movement. */
  stock: number;
  quantity: number;
  unitPrice: number;
}

/**
 * Stock coming in: the value already held, plus this purchase at its own
 * price, spread over the new total.
 */
export function averageAfterAdding({
  avg,
  stock,
  quantity,
  unitPrice,
}: Movement): number {
  const newStock = stock + quantity;
  if (newStock <= 0) return unitPrice;

  return (avg * stock + quantity * unitPrice) / newStock;
}

/**
 * A purchase being taken back out — an invoice edited or deleted.
 *
 * The units leave at the price *they* came in at, not at the current
 * average, which is the only way to land back on what the rest of the stock
 * actually cost. Ten units bought at ۲۰۰۰ on top of five held at ۱۰۰۰ give
 * an average of ۱۶۶۶٫۶۷; removing them at that average would leave the five
 * survivors valued at ۱۶۶۶٫۶۷ apiece rather than the ۱۰۰۰ they cost.
 */
export function averageAfterRemoving({
  avg,
  stock,
  quantity,
  unitPrice,
}: Movement): number {
  const newStock = stock - quantity;

  // Nothing left to value. The previous figure is kept rather than zeroed:
  // the valuation is zero either way at zero stock, and this number's other
  // job is to suggest a price on the next purchase form.
  if (newStock <= 0) return avg;

  // Clamped, because `stock` may already have been reduced by sales the
  // reversal cannot see — a negative valuation would be worse than a low one.
  const remainingValue = Math.max(0, avg * stock - quantity * unitPrice);

  return remainingValue / newStock;
}
