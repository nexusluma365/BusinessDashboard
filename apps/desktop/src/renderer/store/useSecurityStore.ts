import { create } from "zustand";

interface SecurityState {
  unlocked: boolean;
  keyAvailable: boolean;
  mode: "production" | "simulated" | "unknown";
  error: string | null;
  checkKey: () => Promise<void>;
  authenticate: (pin: string) => Promise<void>;
  lock: () => void;
}

export const useSecurityStore = create<SecurityState>((set) => ({
  unlocked: false,
  keyAvailable: false,
  mode: "unknown",
  error: null,

  checkKey: async () => {
    if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
      set({ unlocked: true, keyAvailable: true, mode: "simulated" });
      return;
    }

    if (!window.nexusLuma?.securityKey) {
      set({
        unlocked: false,
        keyAvailable: false,
        mode: "unknown",
        error: "Electron preload bridge is not available.",
      });
      return;
    }

    const result = await window.nexusLuma.securityKey.status();
    set({
      unlocked: result.available && result.mode === "simulated",
      keyAvailable: result.available,
      mode: (result.mode as SecurityState["mode"]) ?? "unknown",
    });
  },

  authenticate: async (pin: string) => {
    set({ error: null });
    const result = await window.nexusLuma.securityKey.authenticate(pin);
    if (result.success) {
      set({ unlocked: true });
    } else {
      set({ error: result.reason ?? "Authentication failed." });
    }
  },

  lock: () => set({ unlocked: false }),
}));
