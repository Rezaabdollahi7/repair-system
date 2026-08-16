import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "mafixo-theme";

export const THEMES = [
  { value: "light", label: "روشن" },
  { value: "dark", label: "تیره" },
  { value: "blue", label: "آبی" },
  { value: "yellow", label: "زرد" },
  { value: "orange", label: "نارنجی" },
  { value: "purple", label: "بنفش" },
] as const;

/** Derived from THEMES rather than listed twice, so the two cannot drift. */
export type Theme = (typeof THEMES)[number]["value"];

const THEME_VALUES: readonly string[] = THEMES.map((t) => t.value);

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEME_VALUES.includes(value);
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : DEFAULT_THEME;
}

const DEFAULT_THEME: Theme = "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (value: Theme) => void;
  themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  // هر بار تم عوض شد: هم روی <html> اعمالش کن، هم توی localStorage ذخیره کن
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // The guard is unreachable through these types but still live at runtime:
  // ThemeSwitcher is JavaScript and nothing checks what it passes.
  function setTheme(value: Theme) {
    if (!isTheme(value)) {
      console.warn(`تم نامعتبر: ${value}`);
      return;
    }
    setThemeState(value);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error("useTheme باید داخل ThemeProvider استفاده شود");
  }
  return ctx;
}
