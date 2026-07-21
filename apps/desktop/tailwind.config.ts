import type { Config } from "tailwindcss";

// Design tokens derived from the reference dashboard screenshots:
// near-black base, charcoal panels, gold primary accent, semantic status colors.
export default {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          panel: "var(--bg-panel)",
          panelHover: "var(--bg-panel-hover)",
        },
        border: {
          DEFAULT: "var(--border-default)",
          subtle: "var(--border-subtle)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        accent: {
          gold: "var(--accent-gold)",
          goldMuted: "var(--accent-gold-muted)",
        },
        status: {
          info: "var(--status-info)",
          success: "var(--status-success)",
          warning: "var(--status-warning)",
          error: "var(--status-error)",
          inactive: "var(--status-inactive)",
          takeover: "var(--status-takeover)",
          newLead: "var(--status-new-lead)",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        glow: "var(--shadow-glow-gold)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
