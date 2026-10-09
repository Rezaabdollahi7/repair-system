import { motion, useReducedMotion } from "framer-motion";
import { toPersianDigits } from "../../utils/formatters";

const SIZE = 148;
const STROKE = 14;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * One ratio against its whole, as a ring.
 *
 * A gauge is the right form for exactly this case and no other: a single
 * measure with a defined ceiling. Three of these side by side would be a
 * bullet-chart grid instead — the ring wastes space once it has to be
 * repeated — so there is one on the dashboard and it is the collection rate.
 *
 * The number and the two amounts are written beside it. Red-to-green shading
 * on the arc was deliberately not used: the fraction is already the message,
 * and colouring it by how good it is would encode a judgement the app is not
 * in a position to make about a particular workshop's month.
 */
export default function Gauge({
  ratio,
  caption,
  color = "var(--accent)",
}: {
  /** 0..1; clamped, because an overpayment can push a collected share past 1. */
  ratio: number;
  caption: string;
  color?: string;
}) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const percent = Math.round(clamped * 100);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          role="img"
          aria-label={`${caption}: ${toPersianDigits(percent)} درصد`}
          /* Twelve o'clock start, filling anticlockwise to match the page. */
          style={{ transform: "rotate(-90deg) scaleX(-1)" }}
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--chart-track)"
            strokeWidth={STROKE}
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            initial={reduceMotion ? false : { strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - clamped) }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.9, ease: [0.16, 1, 0.3, 1] }
            }
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-display-sm font-bold text-text-primary leading-none tabular-nums">
            ٪{toPersianDigits(percent)}
          </span>
        </div>
      </div>
      <p className="text-body-xs text-text-muted mt-2 text-center">{caption}</p>
    </div>
  );
}
