/**
 * Narrows an unknown catch binding to a message string. Controllers catch
 * `unknown` under TypeScript, so this keeps the existing
 * `{ error: message }` response shape without repeating the type check in
 * every handler.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
