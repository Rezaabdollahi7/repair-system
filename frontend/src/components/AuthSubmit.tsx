import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";
import { transition } from "../motion";

/**
 * The primary button on the auth pages.
 *
 * Shows a spinner beside the label rather than replacing it with "در حال
 * ارسال...": swapping the text changes the button's width mid-press, which
 * reads as the page jumping at the exact moment the user is waiting to see
 * whether their click registered.
 */

// Extends motion's own button props, not React's: the two disagree about
// onDrag, and a plain ButtonHTMLAttributes spread will not type-check here.
interface Props extends Omit<HTMLMotionProps<"button">, "children"> {
  loading?: boolean;
  /** Narrowed back to ReactNode: motion widens it to accept a MotionValue. */
  children?: React.ReactNode;
}

export default function AuthSubmit({
  loading = false,
  disabled,
  children,
  className = "",
  ...rest
}: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      whileHover={reduceMotion || loading ? undefined : { y: -1 }}
      whileTap={reduceMotion || loading ? undefined : { scale: 0.985 }}
      transition={transition.fast}
      disabled={disabled || loading}
      // aria-busy, not just a disabled attribute: a screen reader should hear
      // that the request is in flight, not only that the button went dead.
      aria-busy={loading}
      className={`w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover
                  text-primary-fg font-bold text-body-sm py-3 rounded-field shadow-primary
                  transition-colors cursor-pointer
                  disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none
                  ${className}`}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden
          className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin"
        />
      )}
      {children}
    </motion.button>
  );
}
