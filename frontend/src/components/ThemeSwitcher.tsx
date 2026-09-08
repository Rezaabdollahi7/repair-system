import { motion, useReducedMotion } from "framer-motion";
import { SunIcon, MoonIcon, ComputerDesktopIcon } from "@heroicons/react/24/solid";
import {
  useTheme,
  THEME_OPTIONS,
  type ThemePreference,
} from "../context/ThemeContext";
import { spring, transition } from "../motion";

/**
 * Keyed by preference, so an option added to THEME_OPTIONS without an icon
 * here is a compile error rather than a blank button at render time.
 */
const ICONS: Record<
  ThemePreference,
  React.ComponentType<{ className?: string }>
> = {
  light: SunIcon,
  dark: MoonIcon,
  system: ComputerDesktopIcon,
};

const DESCRIPTIONS: Record<ThemePreference, string> = {
  light: "همیشه روشن",
  dark: "همیشه تیره",
  system: "مطابق تنظیم دستگاه",
};

export default function ThemeSwitcher() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();

  return (
    <section className="bg-surface border border-border rounded-card p-4 sm:p-6 shadow-sm">
      <h2 className="text-base sm:text-lg font-bold text-text-primary">
        پوستهٔ برنامه
      </h2>
      <p className="text-sm text-text-secondary mt-1 mb-5">
        {theme === "system"
          ? `الان ${resolvedTheme === "dark" ? "تیره" : "روشن"} است، چون دستگاه شما همین را می‌خواهد`
          : "این انتخاب روی همین مرورگر ذخیره می‌شود"}
      </p>

      {/*
        A segmented control rather than three separate buttons: the options
        are mutually exclusive and the indicator sliding between them says so
        without a caption. role="radiogroup" is what carries the same meaning
        to a screen reader, which sees no indicator at all.
      */}
      <div
        role="radiogroup"
        aria-label="انتخاب پوسته"
        className="relative grid grid-cols-3 gap-1 p-1 bg-surface-alt rounded-field"
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = ICONS[option.value];
          const isActive = theme === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setTheme(option.value)}
              title={DESCRIPTIONS[option.value]}
              className="relative flex flex-col items-center justify-center gap-1.5 py-3 rounded-[0.6rem] cursor-pointer"
            >
              {/*
                One shared layoutId across the three buttons: framer-motion
                animates the single element from the old position to the new
                one, which is why the pill appears to slide rather than
                disappear and reappear.
              */}
              {isActive && (
                <motion.span
                  layoutId="theme-indicator"
                  transition={reduceMotion ? { duration: 0 } : spring}
                  className="absolute inset-0 bg-surface rounded-[0.6rem] shadow-sm border border-border"
                />
              )}

              <motion.span
                className="relative z-10 flex flex-col items-center gap-1.5"
                animate={{ scale: isActive ? 1 : 0.96 }}
                transition={transition.fast}
              >
                <Icon
                  className={`w-5 h-5 transition-colors ${
                    isActive ? "text-primary" : "text-text-secondary"
                  }`}
                />
                <span
                  className={`text-xs sm:text-sm font-medium transition-colors ${
                    isActive ? "text-text-primary" : "text-text-secondary"
                  }`}
                >
                  {option.label}
                </span>
              </motion.span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
