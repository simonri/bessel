/**
 * Format an amount in minor units (cents) as a human-readable string.
 * Always uses sv-SE locale (space thousands separator, comma decimal).
 * Appends the 3-letter currency code as a suffix.
 *
 * Examples:
 *   formatMoney(123456, "SEK") → "1 234,56 SEK"
 *   formatMoney(-50000, "USD") → "-500,00 USD"
 */
export function formatMoney(amountCents: number, currency: string): string {
  return (
    (amountCents / 100).toLocaleString("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) +
    " " +
    currency
  );
}

/**
 * Format an amount in minor units without a currency suffix.
 * Use this only when currency is shown elsewhere in context (column header, etc.).
 */
export function formatAmount(amountCents: number): string {
  return (amountCents / 100).toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a quantity in micro-units (millionths) as a human-readable number.
 * Used for investment quantities.
 */
export function formatQuantity(microUnits: number): string {
  return (microUnits / 1_000_000).toLocaleString("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}
