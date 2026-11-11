import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AppearanceMode = "light" | "dark" | "system" | "custom";
export type AccentColor = "evergreen" | "ocean" | "berry" | "gold";
export type FontStyle = "soft" | "clear";

type Appearance = {
  mode: AppearanceMode;
  accent: AccentColor;
  font: FontStyle;
};

type AppearanceContextValue = Appearance & {
  setMode: (mode: AppearanceMode) => void;
  setAccent: (accent: AccentColor) => void;
  setFont: (font: FontStyle) => void;
};

const STORAGE_KEY = "supportiq-appearance";
const DEFAULT_APPEARANCE: Appearance = { mode: "light", accent: "evergreen", font: "soft" };
const MODES: AppearanceMode[] = ["light", "dark", "system", "custom"];
const ACCENTS: AccentColor[] = ["evergreen", "ocean", "berry", "gold"];
const FONTS: FontStyle[] = ["soft", "clear"];

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function readAppearance(): Appearance {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(stored) as Partial<Appearance>;
    return {
      mode: MODES.includes(parsed.mode as AppearanceMode) ? (parsed.mode as AppearanceMode) : DEFAULT_APPEARANCE.mode,
      accent: ACCENTS.includes(parsed.accent as AccentColor) ? (parsed.accent as AccentColor) : DEFAULT_APPEARANCE.accent,
      font: FONTS.includes(parsed.font as FontStyle) ? (parsed.font as FontStyle) : DEFAULT_APPEARANCE.font,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(readAppearance);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    } catch {
      // Appearance still works for the current session when storage is unavailable.
    }
  }, [appearance]);

  useEffect(() => {
    const root = document.documentElement;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyAppearance = () => {
      const theme = appearance.mode === "system"
        ? systemTheme.matches ? "dark" : "light"
        : appearance.mode === "custom" ? "light" : appearance.mode;
      root.dataset.theme = theme;
      root.dataset.accent = appearance.mode === "custom" ? appearance.accent : "evergreen";
      root.dataset.font = appearance.font;
    };

    applyAppearance();
    if (appearance.mode !== "system") return;
    systemTheme.addEventListener("change", applyAppearance);
    return () => systemTheme.removeEventListener("change", applyAppearance);
  }, [appearance]);

  return (
    <AppearanceContext.Provider
      value={{
        ...appearance,
        setMode: (mode) => setAppearance((current) => ({ ...current, mode })),
        setAccent: (accent) => setAppearance((current) => ({ ...current, accent })),
        setFont: (font) => setAppearance((current) => ({ ...current, font })),
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance must be used within AppearanceProvider.");
  return context;
}