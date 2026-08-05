import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Warm charcoal + brass (mirrors src/styles/tokens.css). Purple neon tokens removed. */
        aura: {
          bg: "#0a0908",
          surface: "#141210",
          raised: "#1a1816",
          ivory: "#EDE6DA",
          champagne: "#E8C77E",
          gold: "#C9A24A",
          "gold-light": "#E8C77E",
          emerald: "#5BA88A",
        },
      },
      fontFamily: {
        /* Cormorant (Cyrillic) — Cinzel dropped: latin-only broke Russian display */
        display: ["var(--font-mystic-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        "mystic-display": ["var(--font-mystic-display)", "Georgia", "serif"],
      },
      animation: {
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "pulse-gold": "pulse-gold 4s ease-in-out infinite",
        float: "float 8s ease-in-out infinite",
        "fade-up": "fade-up 0.7s ease-out forwards",
        "mystic-in": "mystic-in 0.3s ease-out forwards",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.7" },
        },
        "pulse-gold": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(201, 162, 74, 0.15)" },
          "50%": { boxShadow: "0 0 32px rgba(232, 199, 126, 0.35)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "mystic-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      boxShadow: {
        /* Soft brass glow — keep token names for compatibility, drop purple neon */
        neon: "0 0 20px rgba(201, 162, 74, 0.18), 0 0 40px rgba(201, 162, 74, 0.06)",
        "neon-emerald": "0 0 20px rgba(91, 168, 138, 0.2)",
        "neon-gold": "0 0 20px rgba(201, 162, 74, 0.22), 0 0 40px rgba(232, 199, 126, 0.08)",
        lux: "0 16px 48px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(232, 199, 126, 0.08)",
      },
      letterSpacing: {
        lux: "0.22em",
      },
    },
  },
  plugins: [],
};

export default config;
