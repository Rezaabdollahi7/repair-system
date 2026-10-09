import { SERIES } from "./chartSeries";
import type { RoleName } from "../types/api";

/**
 * The three roles, with a colour each.
 *
 * They needed distinguishing rather than styling: the personnel table gave
 * `technician` the neutral chip and both admin roles `bg-primary-soft
 * text-primary`, and once the palette turned those into sand and ink the two
 * chips became the same — a table whose whole «نقش» column said one thing.
 *
 * Colour here is identity, not severity: a technician is not a worse kind of
 * user than an admin, so these take chart series slots rather than
 * success/warning/danger. Slots 1 and 2, in the rank order, which is the
 * adjacency the palette was validated on.
 *
 * The *label* still comes from the API's `role_label`, which is what the
 * roles table says. Only the colour is decided here — a fourth role added
 * server-side renders with the neutral fallback rather than not rendering.
 */
export interface RoleStyle {
  color: string;
  tone?: string;
}

const ROLE_STYLES: Record<RoleName, RoleStyle> = {
  super_admin: { color: SERIES[0] },
  admin: { color: SERIES[1] },
  /*
   * Neutral, and deliberately: a technician is the ordinary case, and most
   * rows in a workshop's personnel list are one. Spending a third hue on the
   * majority row would make the column look busy while saying nothing — the
   * two that matter are the ones with elevated permissions.
   */
  technician: {
    color: "var(--text-muted)",
    tone: "bg-surface-alt text-text-secondary",
  },
};

export function roleStyleOf(role: string | null | undefined): RoleStyle {
  return (
    ROLE_STYLES[role as RoleName] ?? {
      color: "var(--text-muted)",
      tone: "bg-surface-alt text-text-secondary",
    }
  );
}
