import axios from "axios";

/**
 * Pulls the server's Persian message out of a failed request. Every handler
 * answers with `{ error }` on failure, but Axios types the body as unknown,
 * so the shape has to be asserted here rather than at each call site.
 */
export function errorText(error: unknown, fallback: string): string {
  return (
    (axios.isAxiosError(error) &&
      (error.response?.data as { error?: string } | undefined)?.error) ||
    fallback
  );
}
