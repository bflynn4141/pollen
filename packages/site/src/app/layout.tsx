import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Pollen — Prompt Intelligence Network",
  description:
    "Your prompts pollinate shared intelligence. Opt in, contribute anonymized prompt features, and earn crypto.",
  openGraph: {
    title: "Pollen — Prompt Intelligence Network",
    description:
      "Your prompts pollinate shared intelligence. Opt in via a CLI hook. Prompts are classified locally. Contributors earn crypto.",
    type: "website",
    url: "https://pollen.dev",
    siteName: "Pollen",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pollen — Prompt Intelligence Network",
    description:
      "Your prompts pollinate shared intelligence. Opt in via a CLI hook. Contributors earn crypto.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
