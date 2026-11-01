import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CODED Quality", template: "%s · CODED Quality" },
  description: "Education Quality and Approvals System — approvals, classroom QA, instructor performance and CCTP.",
  icons: { icon: [{ url: "/brand/icon-64.png", sizes: "64x64" }, { url: "/brand/icon-512.png", sizes: "512x512" }], apple: "/brand/icon-180.png" },
};
export const viewport: Viewport = { themeColor: "#14243F", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
