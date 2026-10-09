type SpinnerSize = "sm" | "md" | "lg";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  text?: string;
}

/**
 * One arc on a track, rather than the six stacked rings this used to draw.
 * Six overlapping spins at staggered delays read as a flicker at small
 * sizes, and each one was its own animated element.
 */
export default function LoadingSpinner({
  size = "md",
  text = "در حال بارگذاری…",
}: LoadingSpinnerProps) {
  const ring: Record<SpinnerSize, string> = {
    sm: "w-6 h-6 border-2",
    md: "w-10 h-10 border-[3px]",
    lg: "w-14 h-14 border-4",
  };

  const label: Record<SpinnerSize, string> = {
    sm: "text-body-xs",
    md: "text-body-sm",
    lg: "text-body-md",
  };

  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={`${ring[size]} rounded-full border-border border-t-primary animate-spin`}
      />
      {text && <p className={`${label[size]} text-text-secondary`}>{text}</p>}
    </div>
  );
}
