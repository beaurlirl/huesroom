import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

// Absolute URLs for link previews. The game is expected at hue.onl/huesroom (NEXT_PUBLIC_BASE_PATH).
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hue.onl";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const description = "Help Hue collect all 11 coins, as fast as you can.";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "hue's room",
  description,
  openGraph: {
    title: "hue's room",
    description,
    url: `${base}/`,
    images: [{ url: `${base}/og.jpg`, width: 1200, height: 630, alt: "Hue sitting on a tiny chair in a green graffiti room" }],
  },
  twitter: { card: "summary_large_image", title: "hue's room", description, images: [`${base}/og.jpg`] },
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
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
