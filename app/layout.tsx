import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GAME_NAME } from "../src/brand";
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

// Absolute URLs for link previews: the game's own address unless NEXT_PUBLIC_SITE_URL says otherwise (the old hue.onl/huesroom copy sets it, with NEXT_PUBLIC_BASE_PATH).
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://huesroom.vercel.app";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const description = `${GAME_NAME}. Collect every coin as fast as you can and help Hue make it outside. A game by Gest, Lower Manhattan.`;

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: GAME_NAME,
  description,
  openGraph: {
    title: GAME_NAME,
    description,
    url: `${base}/`,
    images: [{ url: `${base}/og.jpg`, width: 1200, height: 630, alt: `${GAME_NAME} — a game developed by Gest in Lower Manhattan` }],
  },
  twitter: { card: "summary_large_image", title: GAME_NAME, description, images: [`${base}/og.jpg`] },
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
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
