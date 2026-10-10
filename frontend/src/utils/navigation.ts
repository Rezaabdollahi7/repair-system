import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Id } from "../types/api";

/**
 * Opening a customer.
 *
 * A customer used to be a modal, reachable from four lists through
 * `openCustomerDetail`. It is a page now — `/customers/:id` — and the four
 * lists reach it the same way they always did, through one function rather
 * than four copies of a template string. A path written out four times is a
 * path that gets renamed in three of them.
 */
export function useGoToCustomer() {
  const navigate = useNavigate();

  return useCallback(
    (customerId: Id) => navigate(`/customers/${customerId}`),
    [navigate],
  );
}

/**
 * Opening an item (14.18).
 *
 * The item was a modal until it gained a kardex, a trade history and price
 * figures — a screen a shop reads for a while, reached from the item list,
 * the stock and profit reports, the ledger and every invoice. From inside
 * an invoice modal, the caller closes the stack first: a page change under
 * an open modal would leave the modal standing over the wrong screen.
 */
export function useGoToItem() {
  const navigate = useNavigate();

  return useCallback((itemId: Id) => navigate(`/items/${itemId}`), [navigate]);
}

/**
 * Opening a member of staff.
 *
 * Same story as the customer: reached from the personnel list and from a
 * technician's name on a device or an invoice, so `/personnel/:id` is a
 * page rather than a modal.
 */
export function useGoToPersonnel() {
  const navigate = useNavigate();

  return useCallback(
    (personnelId: Id) => navigate(`/personnel/${personnelId}`),
    [navigate],
  );
}
