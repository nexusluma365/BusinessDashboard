import { create } from "zustand";

type SylusAction = { type: "navigate"; path: string; label: string };
type SylusMessage = { role: "user" | "assistant"; content: string; groundedOn?: string; action?: SylusAction };

interface SylusState {
  open: boolean;
  loading: boolean;
  messages: SylusMessage[];
  toggle: () => void;
  ask: (question: string) => Promise<SylusAction | null>;
}

export const useSylusStore = create<SylusState>((set) => ({
  open: false,
  loading: false,
  messages: [],

  toggle: () => set((s) => ({ open: !s.open })),

  ask: async (question: string) => {
    set((s) => ({ messages: [...s.messages, { role: "user", content: question }], loading: true }));
    try {
      const result = await window.nexusLuma.sylus.ask(question);
      set((s) => ({
        messages: [
          ...s.messages,
          { role: "assistant", content: result.answer, groundedOn: result.groundedOn, action: result.action },
        ],
        loading: false,
      }));
      return result.action ?? null;
    } catch (err) {
      set((s) => ({
        messages: [...s.messages, { role: "assistant", content: `Error: ${(err as Error).message}` }],
        loading: false,
      }));
      return null;
    }
  },
}));
