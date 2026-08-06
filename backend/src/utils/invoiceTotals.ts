export interface DiscountableLine {
  quantity: number;
  unit_price?: number;
  discount_type?: string | null;
  discount_value?: number;
}

export interface LineTotals {
  discountAmount: number;
  totalPrice: number;
}

/**
 * A line's own discount, before any invoice-level one. Rounded because the
 * amount columns are Decimal(18, 0) — rial has no minor unit, and rounding
 * here keeps the response identical to what gets stored.
 */
export function lineTotals(line: DiscountableLine): LineTotals {
  const gross = line.quantity * (line.unit_price ?? 0);

  let discountAmount = 0;
  if (line.discount_type === "percentage") {
    discountAmount = gross * ((line.discount_value ?? 0) / 100);
  } else if (line.discount_type === "fixed") {
    discountAmount = line.discount_value ?? 0;
  }

  return {
    discountAmount: Math.round(discountAmount),
    totalPrice: Math.round(gross - discountAmount),
  };
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * Subtotal is the sum of the lines after their own discounts; the
 * invoice-level discount then comes off that, and tax applies to what's left.
 */
export function invoiceTotals(
  lines: DiscountableLine[],
  discountType: string | null | undefined,
  discountValue: number,
  taxRate: number,
): InvoiceTotals {
  const subtotal = lines.reduce(
    (sum, line) => sum + lineTotals(line).totalPrice,
    0,
  );

  let discountAmount = 0;
  if (discountType === "percentage") {
    discountAmount = subtotal * (discountValue / 100);
  } else if (discountType === "fixed") {
    discountAmount = discountValue;
  }
  discountAmount = Math.round(discountAmount);

  // Clamped: a fixed discount larger than the subtotal would otherwise make
  // the tax base negative.
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = Math.round(afterDiscount * (taxRate / 100));

  return {
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount: afterDiscount + taxAmount,
  };
}
