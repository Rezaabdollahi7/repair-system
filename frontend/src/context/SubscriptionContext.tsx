import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getSubscription } from "../api";
import { useAuth } from "./AuthContext";
import type { SubscriptionStatusResponse } from "../types/api";

interface SubscriptionContextValue {
  status: SubscriptionStatusResponse | null;
  loading: boolean;
  /** Re-reads it. Called after a payment verifies, so the banner clears. */
  reload: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(
  null,
);

/**
 * The subscription, read once and shared.
 *
 * The banner and the subscription page both need it, and after a payment
 * both have to see the new date — two independent fetches would leave one of
 * them still showing a countdown that has just been paid off.
 */
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isAtLeast } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    // The endpoint is admin-only, and a technician asking for it would get a
    // 403 on every page load — an error in the console for something that
    // was never their business.
    if (!user || !isAtLeast("admin")) {
      setStatus(null);
      return;
    }

    setLoading(true);

    try {
      const { data } = await getSubscription();
      setStatus(data);
    } catch {
      // Left null, which the banner reads as "nothing to say". A failure
      // here must not stop the rest of the app rendering: the shop has work
      // to do and this is a countdown, not a gate — the gate is the 402 the
      // server returns on a write.
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [user, isAtLeast]);

  useEffect(() => {
    // Deferred rather than called straight away: setState in an effect body
    // makes React render twice before the browser paints, and this is a
    // banner nobody is waiting on.
    const id = setTimeout(() => void reload(), 0);
    return () => clearTimeout(id);
  }, [reload]);

  return (
    <SubscriptionContext.Provider value={{ status, loading, reload }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error("useSubscription must be used inside SubscriptionProvider");
  }
  return ctx;
}
