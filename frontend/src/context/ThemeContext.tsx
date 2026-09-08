import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Must match the key read by the pre-paint script in index.html. That script
 * is what stops a dark-theme user seeing one white frame on load; if the two
 * ever disagree, the flash comes back silently.
 */
const STORAGE_KEY = "dofixo-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * What the user picked. The app used to offer six themes; a repair shop wants
 * a readable screen, not a palette, so this is now light, dark, and letting
 * the operating system decide.
 */
export const THEME_OPTIONS = [
  { value: "light", label: "روشن" },
  { value: "dark", label: "تیره" },
  { value: "system", label: "سیستم" },
] as const;

/** Derived from THEME_OPTIONS rather than listed twice, so the two cannot drift. */
export type ThemePreference = (typeof THEME_OPTIONS)[number]["value"];

/** What actually lands on <html data-theme>. "system" resolves to one of these. */
export type ResolvedTheme = "light" | "dark";

const PREFERENCE_VALUES: readonly string[] = THEME_OPTIONS.map((t) => t.value);

function isPreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && PREFERENCE_VALUES.includes(value);
}

const DEFAULT_PREFERENCE: ThemePreference = "system";

/**
 * Anything unrecognised falls back to the default, which is also the
 * migration path off the four themes that were removed: a browser still
 * holding "purple" gets the system theme instead of an error.
 */
function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_PREFERENCE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : DEFAULT_PREFERENCE;
  } catch {
    // Safari in private mode throws rather than returning null.
    return DEFAULT_PREFERENCE;
  }
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

interface ThemeContextValue {
  /** What the user chose, including "system". */
  theme: ThemePreference;
  /** What is actually on screen. Use this to pick an icon or an image. */
  resolvedTheme: ResolvedTheme;
  setTheme: (value: ThemePreference) => void;
  /** Light ⇄ dark in one click, for the shortcut in the sidebar. */
  toggleTheme: () => void;
  options: typeof THEME_OPTIONS;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(getStoredPreference);
  const [systemIsDark, setSystemIsDark] = useState(
    () => systemTheme() === "dark",
  );

  // Only meaningful while the preference is "system", but subscribing
  // unconditionally keeps the value correct the moment it switches back —
  // otherwise the first render after choosing "system" would use a stale flag.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) =>
      setSystemIsDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: ResolvedTheme = useMemo(
    () => (theme === "system" ? (systemIsDark ? "dark" : "light") : theme),
    [theme, systemIsDark],
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not being able to remember the choice is worth less than crashing the
      // app over it; the theme still applies for this session.
    }
  }, [theme]);

  const setTheme = useCallback((value: ThemePreference) => {
    if (!isPreference(value)) {
      console.warn(`تم نامعتبر: ${value}`);
      return;
    }
    setThemeState(value);
  }, []);

  // Toggling from "system" commits to the opposite of what is on screen,
  // rather than to a fixed side — the click means "not this", whichever way
  // the system happened to be pointing.
  const toggleTheme = useCallback(() => {
    setThemeState(resolve(theme) === "dark" ? "light" : "dark");
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
      options: THEME_OPTIONS,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error("useTheme باید داخل ThemeProvider استفاده شود");
  }
  return ctx;
}
