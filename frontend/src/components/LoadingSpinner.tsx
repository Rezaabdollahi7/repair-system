type SpinnerSize = "sm" | "md" | "lg";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  text?: string;
}

export default function LoadingSpinner({
  size = "md",
  text = " دارم لود میکنم  ...",
}: LoadingSpinnerProps) {
  const sizeClasses: Record<SpinnerSize, string> = {
    sm: "h-16 w-16",
    md: "h-24 w-24",
    lg: "h-32 w-32",
  };

  const textSizes: Record<SpinnerSize, string> = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4" dir="rtl">
      {/* Spinner */}
      <div className={`relative ${sizeClasses[size]}`}>
        {[0, 40, 80, 120, 160, 200].map((delay, index) => (
          <div
            key={index}
            className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"
            style={{
              animationDuration: "1.5s",
              animationDelay: `${delay}ms`,
              opacity: 1 - index * 0.12,
            }}
          />
        ))}
      </div>

      {/* Text */}
      {text && (
        <p
          className={`text-text-secondary font-medium mt-4 ${textSizes[size]}`}
        >
          {text}
        </p>
      )}
    </div>
  );
}
