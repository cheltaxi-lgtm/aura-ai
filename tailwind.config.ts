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
        aura: {
          bg: "#07050f",
          midnight: "#0c0a1a",
          plum: "#1a0f2e",
          indigo: "#12102a",
          ivory: "#EDE6DA",
          champagne: "#E8C77E",
          gold: "#C9A24A",
          "gold-light": "#E8C77E",
          purple: "#9B7FD4",
          emerald: "#5BA88A",
          neon: "#B794F6",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "pulse-gold": "pulse-gold 4s ease-in-out infinite",
        float: "float 8s ease-in-out infinite",
        "fade-up": "fade-up 0.7s ease-out forwards",
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
      },
      boxShadow: {
        neon: "0 0 24px rgba(155, 127, 212, 0.25), 0 0 48px rgba(155, 127, 212, 0.08)",
        "neon-emerald": "0 0 24px rgba(91, 168, 138, 0.25)",
        "neon-gold": "0 0 24px rgba(201, 162, 74, 0.3), 0 0 48px rgba(232, 199, 126, 0.12)",
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
