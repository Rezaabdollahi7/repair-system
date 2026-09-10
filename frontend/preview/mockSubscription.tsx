import type { ReactNode } from "react";
const PLANS = [
  { code: "m1", name: "یک‌ماهه", duration_days: 30, base_price_rials: 4900000, amount_rials: 4900000 },
  { code: "m3", name: "سه‌ماهه", duration_days: 90, base_price_rials: 13500000, amount_rials: 12900000 },
  { code: "m6", name: "شش‌ماهه", duration_days: 180, base_price_rials: 25000000, amount_rials: 22900000 },
  { code: "m12", name: "یک‌ساله", duration_days: 365, base_price_rials: 45000000, amount_rials: 39900000 },
];
export function useSubscription() {
  return {
    status: {
      status: "trial" as const,
      expires_at: "2026-10-03T00:00:00.000Z",
      never_expires: false,
      referral_applies: true,
      plans: PLANS,
    },
    loading: false,
    reload: async () => {},
  };
}
export function SubscriptionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
