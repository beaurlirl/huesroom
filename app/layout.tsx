import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Union, the directory.onl / hue.onl house face (owner's font), used for all UI.
const union = localFont({
  src: [
    { path: "./fonts/Union-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/Union-Bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-union",
  display: "swap",
});

// Absolute URLs for link previews. The game is expected at hue.onl/huesroom (NEXT_PUBLIC_BASE_PATH).
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hue.onl";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const description = "Hue leaves home. Collect all 11 coins, as fast as you can, and unlock hue.onl. A game by Gest, Lower Manhattan.";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Hue Leaves Home",
  description,
  openGraph: {
    title: "Hue Leaves Home",
    description,
    url: `${base}/`,
    images: [{ url: `${base}/og.jpg`, width: 1200, height: 630, alt: "Hue Leaves Home — a game developed by Gest in Lower Manhattan" }],
  },
  twitter: { card: "summary_large_image", title: "Hue Leaves Home", description, images: [`${base}/og.jpg`] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${union.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
