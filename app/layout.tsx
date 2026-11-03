import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CODED Quality", template: "%s · CODED Quality" },
  description: "CODED Quality: education quality and approvals. Approvals, classroom QA, instructor performance and CCTP.",
  icons: { icon: [{ url: "/brand/icon-64.png", sizes: "64x64" }, { url: "/brand/icon-512.png", sizes: "512x512" }], apple: "/brand/icon-180.png" },
};
export const viewport: Viewport = { themeColor: "#0A1630", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
