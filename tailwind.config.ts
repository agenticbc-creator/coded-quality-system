import type { Config } from "tailwindcss";

// CODED master brand (official Figma library): Navy #14243F, Blue #004AA3, Light Gray #D2D2D2, Black #1A1A1A, White.
// Supporting neutrals from the CODED document system: navy-soft #3D4B63, navy-muted #9AA6BC, ink #1F2937, grey #6B7280, rule #E4E7EC.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // CODED Product Theme (light): navy frame, one electric action colour, Brand Blue for selection.
        navy: { DEFAULT: "#14243F", 950: "#061331", 900: "#14243F", 800: "#1C3051", 700: "#3D4B63", 600: "#56647D", 400: "#9AA6BC", 200: "#D5DBE6", 100: "#EBEEF4" },
        chrome: "#0A1630",
        brand: { DEFAULT: "#3059FF", 50: "#E8EEFF", 100: "#DCE4FF", 200: "#BCC9FF", 400: "#8DA4FF", 500: "#3059FF", 600: "#2348E6", 700: "#012891" },
        select: { DEFAULT: "#004AA3", bg: "#E8EEFF" },
        ink: { DEFAULT: "#0B1630", 600: "#45577A", 500: "#56678A", 400: "#7D8BA6", 300: "#C9D0DE" },
        canvas: "#F4F6FB",
        zebra: "#F0F3FA",
        line: "#E3E7F0",
        hairline: "#C9D0DE",
        tier1: { DEFAULT: "#0E7550", bg: "#E4F4EB" },
        tier2: { DEFAULT: "#0B6B78", bg: "#E1F3F5" },
        tier3: { DEFAULT: "#9A5B00", bg: "#FFF3D9" },
        tier4: { DEFAULT: "#C42B38", bg: "#FDECEA" },
      },
      fontFamily: {
        sans: ["Manrope", '"IBM Plex Sans Arabic"', "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        arabic: ['"IBM Plex Sans Arabic"', "Manrope", "sans-serif"],
        mono: ['"Space Mono"', "ui-monospace", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(10,22,48,.06), 0 8px 24px -12px rgba(10,22,48,.14)",
        lift: "0 12px 32px -12px rgba(10,22,48,.28)",
        frame: "inset 0 0 0 2px #14243F",
        glow: "0 14px 40px -8px rgba(48,89,255,.55), 0 0 60px -18px rgba(141,164,255,.6)",
      },
      borderRadius: { lg: "10px", xl: "12px", "2xl": "14px", "3xl": "20px" },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        fill: { "0%": { strokeDashoffset: "var(--dash)" } },
      },
      animation: { rise: "rise .45s cubic-bezier(.2,.7,.2,1) both", fill: "fill 1s cubic-bezier(.2,.7,.2,1) both" },
    },
  },
  plugins: [],
} satisfies Config;
