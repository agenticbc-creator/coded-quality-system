import type { Config } from "tailwindcss";

// CODED master brand: Navy #14243F, Blue #004AA3, Light Gray #D2D2D2, Black #1A1A1A
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#14243F", 950: "#0B1526", 900: "#14243F", 800: "#1D3254", 700: "#2A4470", 600: "#3D5A8C" },
        brand: { DEFAULT: "#004AA3", 50: "#EAF2FC", 100: "#D3E3F8", 200: "#A8C7F0", 400: "#3C7FD0", 500: "#004AA3", 600: "#003D87", 700: "#00306B" },
        ink: { DEFAULT: "#1A1A1A", 600: "#4A5160", 500: "#6B7280", 400: "#9AA1AD", 300: "#C4C9D2" },
        canvas: "#F5F6F8",
        line: "#E4E7EC",
        tier1: { DEFAULT: "#0F8A5F", bg: "#E6F5EF" },
        tier2: { DEFAULT: "#004AA3", bg: "#EAF2FC" },
        tier3: { DEFAULT: "#B26B00", bg: "#FFF4E0" },
        tier4: { DEFAULT: "#C2362F", bg: "#FDECEB" },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        arabic: ['"IBM Plex Sans Arabic"', '"IBM Plex Sans"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
        lift: "0 8px 24px -8px rgba(20,36,63,.18)",
      },
      borderRadius: { xl: "14px" },
    },
  },
  plugins: [],
} satisfies Config;
