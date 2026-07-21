import { create } from "zustand";

type ThemeMode = "light" | "dark";

type ThemeState = {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
};

const storageKey = "syrus-theme-mode";

function initialMode(): ThemeMode {
  const saved = localStorage.getItem(storageKey);
  return saved === "dark" || saved === "light" ? saved : "light";
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initialMode(),
  toggle: () =>
    set((state) => {
      const mode = state.mode === "light" ? "dark" : "light";
      localStorage.setItem(storageKey, mode);
      return { mode };
    }),
  setMode: (mode) => {
    localStorage.setItem(storageKey, mode);
    set({ mode });
  },
}));
