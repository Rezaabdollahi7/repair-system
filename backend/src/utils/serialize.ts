type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// Prisma's Decimal is a decimal.js instance. Detected structurally rather
// than by importing the Prisma namespace, so this doesn't break if the
// generated client's export paths shift between versions.
function isDecimal(value: object): boolean {
  return (
    "toNumber" in value &&
    typeof (value as { toNumber: unknown }).toNumber === "function"
  );
}

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

/**
 * Converts a Prisma result into the shape the frontend already expects:
 * snake_case keys, plain numbers instead of Decimal/BigInt, and ISO strings
 * for dates. Centralised here so the response contract lives in one place
 * rather than being re-implemented in every controller.
 */
export function serialize(value: unknown): Json {
  if (value === null || value === undefined) return null;

  if (typeof value === "bigint") return Number(value);

  if (Array.isArray(value)) return value.map(serialize);

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if (isDecimal(value)) {
      return (value as { toNumber: () => number }).toNumber();
    }

    const result: { [k: string]: Json } = {};
    for (const [key, val] of Object.entries(value)) {
      result[toSnakeCase(key)] = serialize(val);
    }
    return result;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return null;
}
