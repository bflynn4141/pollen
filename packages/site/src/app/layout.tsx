import type { Metadata } from "next";
import { Playfair_Display, Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider";
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

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-grotesk",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
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
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
