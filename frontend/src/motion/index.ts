import type { Transition, Variants } from "framer-motion";

/**
 * The project's motion vocabulary, in one place.
 *
 * Every duration and curve the interface uses is named here rather than typed
 * into each component. Motion reads as intentional only when everything moves
 * on the same clock; forty components each picking their own 0.25s and
 * "easeOut" is what makes an interface feel assembled rather than designed.
 *
 * Nothing here checks prefers-reduced-motion, and nothing needs to: App.tsx
 * wraps the tree in <MotionConfig reducedMotion="user">, which strips the
 * transform half of every variant below — the `y`, the `x`, the `scale` —
 * and leaves the opacity. Components still reach for useReducedMotion()
 * where the honest fallback is not "the same thing without the movement":
 * a blob that breathes on a fourteen-second loop has to stop, not slow.
 */

/** Seconds, matching framer-motion's unit. */
export const duration = {
  /** Hover, focus, colour — fast enough to feel like a direct response. */
  fast: 0.15,
  /** The default: buttons, badges, small state changes. */
  base: 0.22,
  /** Panels, cards, list items entering. */
  slow: 0.35,
  /** Full-screen or modal transitions, where distance justifies the time. */
  slower: 0.5,
} as const;

/**
 * Curves are written as cubic-bezier arrays rather than named strings so they
 * match the CSS custom properties in index.css exactly — the same movement
 * whether it is animated by framer-motion or by a Tailwind transition.
 */
export const ease = {
  /** Decelerating, no overshoot. The workhorse for things entering. */
  out: [0.16, 1, 0.3, 1],
  /** Gentler tail than `out`; for larger surfaces where a snap looks abrupt. */
  smooth: [0.32, 0.72, 0, 1],
  /** Symmetric, for something that moves and comes back — a toggle knob. */
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** A soft spring for anything the user drags or toggles directly. */
export const spring: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 32,
  mass: 0.8,
};

export const transition = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.smooth },
} satisfies Record<string, Transition>;

/* ── Reusable variants ─────────────────────────────────────────────── */

/** The default entrance: a short rise with the fade, never a long slide. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: transition.slow },
  exit: { opacity: 0, y: -8, transition: transition.fast },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: transition.base },
  exit: { opacity: 0, scale: 0.98, transition: transition.fast },
};

/**
 * Put on a list; children using `staggerItem` then arrive in sequence.
 *
 * The delay is small on purpose. At 0.05s a ten-row table finishes in half a
 * second; at the 0.1s that looks good in a demo, the last row of a fifty-row
 * list arrives five seconds after the first, and the page feels broken.
 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: transition.base },
};

/**
 * Direction-aware slide for a right-hand RTL drawer, and for step-to-step
 * movement inside a form. In RTL, "forward" means travelling leftwards.
 */
export const slideFromEnd: Variants = {
  hidden: { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0, transition: transition.slow },
  exit: { opacity: 0, x: 24, transition: transition.fast },
};

/** Modal backdrop: fade only, so it never competes with the panel itself. */
export const backdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.fast },
  exit: { opacity: 0, transition: transition.fast },
};

/** Modal panel: rises and settles, with the backdrop already in place. */
export const modalPanel: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: transition.base },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: transition.fast },
};

/*
 * Two earlier entries are gone: `fadeIn`, which every call site preferred to
 * write as a bare opacity pair, and `pressable`, which nothing adopted — the
 * shared buttons in utils/tableClasses.ts do their hover with a CSS
 * transition and never became motion components. A vocabulary is only useful
 * while everything in it is spoken.
 */
