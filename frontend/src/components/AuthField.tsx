import { useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { transition } from "../motion";

/**
 * One labelled input for the three auth pages.
 *
 * Not the start of a component library — login, sign-up and password reset
 * were repeating the same six classes, the same hint paragraph and, in two
 * places, the same hand-rolled password-reveal button. This is that
 * repetition collected, and nothing outside `pages/{Login,Register,
 * ForgotPassword}` uses it.
 *
 * The label sits on the border rather than above it, following the design
 * guideline. That only works while the field's own background matches what
 * is behind it, which is why the auth pages put the form column on
 * `--surface` — on `--bg` the label would carry a pale stripe behind it.
 *
 * The error is rendered here rather than left to a toast: a toast says
 * something is wrong, this says which field.
 */

interface Props extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "id"
> {
  label: string;
  hint?: string;
  error?: string;
  /** Marks the label with «اختیاری» instead of leaving the user to guess. */
  optional?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

export default function AuthField({
  label,
  hint,
  error,
  optional,
  icon: Icon,
  type = "text",
  className = "",
  required,
  ...rest
}: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [revealed, setRevealed] = useState(false);

  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;

  return (
    <div className={className}>
      <div className="relative">
        <label
          htmlFor={id}
          className={`absolute -top-2 right-3 z-10 px-1.5 bg-surface flex items-baseline gap-1
                      text-body-xs font-bold pointer-events-none
                      ${error ? "text-danger-fg" : "text-text-primary"}`}
        >
          {label}
          {/* The asterisk is decorative — `required` on the input is what a
              screen reader announces, and reading "star" adds nothing. */}
          {required && (
            <span
              aria-hidden
              className="text-danger-fg text-[0.85em] leading-none self-start"
            >
              *
            </span>
          )}
          {optional && (
            <span className="font-normal text-text-muted">(اختیاری)</span>
          )}
        </label>

        {Icon && (
          <Icon className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-3.5 w-[1.15rem] h-[1.15rem] text-text-muted" />
        )}

        <input
          id={id}
          type={inputType}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`w-full bg-surface text-text-primary placeholder:text-text-muted
                      text-body-sm border rounded-field py-3
                      transition-[border-color,box-shadow] duration-150 focus:outline-none
                      ${Icon ? "pr-11" : "pr-3.5"}
                      ${isPassword ? "pl-11" : "pl-3.5"}
                      ${
                        error
                          ? "border-danger focus:shadow-[0_0_0_3px_var(--danger-soft)]"
                          : "border-border-field hover:border-border-strong focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)]"
                      }`}
          {...rest}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            // Skipped by Tab: it is a convenience, and stopping between the
            // password and the submit button on every form is not one.
            tabIndex={-1}
            aria-label={revealed ? "مخفی کردن رمز عبور" : "نمایش رمز عبور"}
            className="absolute top-1/2 -translate-y-1/2 left-3 p-1 rounded-md text-text-muted
                       hover:text-text-primary transition-colors cursor-pointer"
          >
            {revealed ? (
              <EyeSlashIcon className="w-[1.15rem] h-[1.15rem]" />
            ) : (
              <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
            )}
          </button>
        )}
      </div>

      {/* The error replaces the hint rather than stacking under it, so the
          field never grows by two lines and pushes the submit button down. */}
      <AnimatePresence mode="wait" initial={false}>
        {error ? (
          <motion.p
            key="error"
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={transition.fast}
            className="text-body-xs text-danger-fg mt-1.5"
          >
            {error}
          </motion.p>
        ) : (
          hint && (
            <p
              key="hint"
              id={hintId}
              className="text-body-xs text-text-secondary mt-1.5"
            >
              {hint}
            </p>
          )
        )}
      </AnimatePresence>
    </div>
  );
}
