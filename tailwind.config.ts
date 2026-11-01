import type { Config } from "tailwindcss";

// CODED master brand (official Figma library): Navy #14243F, Blue #004AA3, Light Gray #D2D2D2, Black #1A1A1A, White.
// Supporting neutrals from the CODED document system: navy-soft #3D4B63, navy-muted #9AA6BC, ink #1F2937, grey #6B7280, rule #E4E7EC.
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#14243F", 950: "#0A1426", 900: "#14243F", 800: "#1C3051", 700: "#3D4B63", 600: "#56647D", 400: "#9AA6BC", 200: "#D5DBE6", 100: "#EBEEF4" },
        brand: { DEFAULT: "#004AA3", 50: "#F1F5FB", 100: "#DCE7F6", 200: "#B5CDEC", 400: "#3373C0", 500: "#004AA3", 600: "#003C82", 700: "#002F66" },
        ink: { DEFAULT: "#1F2937", 600: "#3D4B63", 500: "#6B7280", 400: "#9AA1AC", 300: "#D2D2D2" },
        canvas: "#F4F5F8",
        zebra: "#FAFAFC",
        line: "#E4E7EC",
        hairline: "#D2D2D2",
        tier1: { DEFAULT: "#0E7A55", bg: "#E7F4EE" },
        tier2: { DEFAULT: "#004AA3", bg: "#F1F5FB" },
        tier3: { DEFAULT: "#A35F00", bg: "#FFF3DF" },
        tier4: { DEFAULT: "#B42E28", bg: "#FCECEA" },
      },
      fontFamily: {
        sans: ["Inter", '"Helvetica Neue"', "Helvetica", "system-ui", "sans-serif"],
        arabic: ['"IBM Plex Sans Arabic"', "Inter", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(20,36,63,.04), 0 1px 2px rgba(20,36,63,.06)",
        lift: "0 12px 32px -12px rgba(20,36,63,.28)",
        frame: "inset 0 0 0 2px #14243F",
      },
      borderRadius: { xl: "10px", "2xl": "14px" },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        fill: { "0%": { strokeDashoffset: "var(--dash)" } },
      },
      animation: { rise: "rise .45s cubic-bezier(.2,.7,.2,1) both", fill: "fill 1s cubic-bezier(.2,.7,.2,1) both" },
    },
  },
  plugins: [],
} satisfies Config;
