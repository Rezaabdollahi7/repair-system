import { useEffect, useState, type ReactNode } from "react";
export const THEME_OPTIONS = [
  { value: "light", label: "روشن" },
  { value: "dark", label: "تیره" },
  { value: "system", label: "سیستم" },
] as const;
export type ThemePreference = (typeof THEME_OPTIONS)[number]["value"];
export type ResolvedTheme = "light" | "dark";
export function useTheme() {
  const initial =
    new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light";
  const [theme, setTheme] = useState<ThemePreference>(initial);
  const resolvedTheme: ResolvedTheme = theme === "dark" ? "dark" : "light";
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);
  return {
    theme, resolvedTheme, setTheme,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    options: THEME_OPTIONS,
  };
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
