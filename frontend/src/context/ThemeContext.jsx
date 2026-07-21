// src/context/ThemeContext.jsx
import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "mafixo-theme";

export const THEMES = [
  { value: "light", label: "روشن" },
  { value: "dark", label: "تیره" },
  { value: "blue", label: "آبی" },
  { value: "yellow", label: "زرد" },
  { value: "orange", label: "نارنجی" },
  { value: "purple", label: "بنفش" },
];

const THEME_VALUES = THEMES.map((t) => t.value);
const DEFAULT_THEME = "light";

function getStoredTheme() {
  if (typeof window === "undefined") return DEFAULT_THEME;
  const stored = localStorage.getItem(STORAGE_KEY);
  return THEME_VALUES.includes(stored) ? stored : DEFAULT_THEME;
}

const ThemeContext = createContext(undefined);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getStoredTheme);

  // هر بار تم عوض شد: هم روی <html> اعمالش کن، هم توی localStorage ذخیره کن
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function setTheme(value) {
    if (!THEME_VALUES.includes(value)) {
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
