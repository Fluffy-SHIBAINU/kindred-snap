import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";

// One typeface, chosen for low-vision legibility (Braille Institute). Weights cover body, labels and headlines.
const hyperlegible = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

const hyperlegibleMono = Atkinson_Hyperlegible_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kindred Snap",
  description:
    "Snap the bill once. Kindred investigates, prepares the right request, asks for one approval, and tracks the case to a documented resolution.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Never lock zoom: older adults pinch to read.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hyperlegible.variable} ${hyperlegibleMono.variable}`}>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
