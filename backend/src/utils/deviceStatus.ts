/**
 * How a device's status divides up, for the pages that count them.
 *
 * The customer page and the personnel page both ask the same three
 * questions of the same column, and had started answering them with their
 * own copies of these arrays. A status is one thing with one meaning; two
 * copies is how «تعمیر شده» ends up counting as a success on one screen and
 * not the other.
 *
 * The frontend's `utils/deviceStatus.ts` holds the labels and colours. This
 * holds only the groupings the server needs to count by, deliberately: a
 * label belongs where it is rendered.
 */

/**
 * The three states in which a device is no longer the shop's problem —
 * handed back, or written off.
 */
export const TERMINAL_STATUSES = ["delivered", "unrepairable", "not_repaired"];

/**
 * Repairs that came out the other side.
 *
 * `repaired` and `ready_for_pickup` are finished work sitting on a shelf,
 * so they count here while still counting as *active* — a device in the
 * building is capacity the shop has not got back yet. The two questions are
 * different and the overlap is the honest answer to both.
 */
export const SUCCESSFUL_STATUSES = [
  "repaired",
  "ready_for_pickup",
  "delivered",
];

/** Repairs that did not. */
export const FAILED_STATUSES = ["unrepairable", "not_repaired"];

/** Everything that has reached an outcome, either way. */
export const CONCLUDED_STATUSES = [...SUCCESSFUL_STATUSES, ...FAILED_STATUSES];

/** Still in the building: not handed back and not written off. */
export function isActive(status: string): boolean {
  return !TERMINAL_STATUSES.includes(status);
}
