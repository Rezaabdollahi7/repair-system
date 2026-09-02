/**
 * Narrows an unknown catch binding to a message string. Controllers catch
 * `unknown` under TypeScript, so this keeps the existing
 * `{ error: message }` response shape without repeating the type check in
 * every handler.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Prisma reports a unique-constraint violation as P2002. Detected
 * structurally rather than by importing PrismaClientKnownRequestError, so the
 * check doesn't depend on the generated client's export layout.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
