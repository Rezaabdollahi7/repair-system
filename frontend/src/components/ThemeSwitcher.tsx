import { CheckIcon } from "@heroicons/react/24/solid";
import { useTheme, THEMES, type Theme } from "../context/ThemeContext";

/**
 * Preview swatches, deliberately independent of the real CSS variables: each
 * one must show its own colours regardless of which theme is currently
 * applied to the page.
 *
 * Keyed by Theme, so a theme added to THEMES without a swatch here is a
 * compile error rather than an undefined lookup at render time.
 */
const THEME_PREVIEWS: Record<Theme, { bg: string; primary: string; surface: string }> = {
  light: { bg: "#f8fafc", primary: "#2563eb", surface: "#ffffff" },
  dark: { bg: "#0f172a", primary: "#3b82f6", surface: "#1e293b" },
  blue: { bg: "#eff6ff", primary: "#1d4ed8", surface: "#ffffff" },
  yellow: { bg: "#fefce8", primary: "#ca8a04", surface: "#ffffff" },
  orange: { bg: "#fff7ed", primary: "#ea580c", surface: "#ffffff" },
  purple: { bg: "#110e2d", primary: "#7c5cfc", surface: "#1b1640" },
};

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="bg-surface border border-border rounded-xl p-4 sm:p-6">
      <h2 className="text-base sm:text-lg font-medium text-text-primary mb-1">
        پوسته برنامه
      </h2>
      <p className="text-sm text-text-secondary mb-4">
        یکی از تم‌های زیر را برای نمایش برنامه انتخاب کنید
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {THEMES.map((t) => {
          const preview = THEME_PREVIEWS[t.value];
          const isActive = theme === t.value;

          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTheme(t.value)}
              className={`relative rounded-lg border-2 p-3 flex flex-col items-center gap-2 transition-colors ${
                isActive
                  ? "border-primary"
                  : "border-border hover:border-text-secondary"
              }`}
            >
              {isActive && (
                <span className="absolute top-1.5 left-1.5 bg-primary text-text-inverse rounded-full p-0.5">
                  <CheckIcon className="w-3 h-3" />
                </span>
              )}

              {/* Colour preview */}
              <div
                className="w-full h-12 rounded-md border border-black/5 overflow-hidden flex"
                style={{ backgroundColor: preview.bg }}
              >
                <div
                  className="w-1/3 h-full"
                  style={{ backgroundColor: preview.surface }}
                />
                <div className="flex-1 h-full flex items-center justify-center">
                  <span
                    className="w-6 h-2 rounded-full"
                    style={{ backgroundColor: preview.primary }}
                  />
                </div>
              </div>

              <span
                className={`text-xs sm:text-sm font-medium ${
                  isActive ? "text-primary" : "text-text-primary"
                }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
