import type { Metadata } from "next";
import { Space_Grotesk, Inter, Playfair_Display, JetBrains_Mono } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: "Pollen | The Shared Intelligence Network",
  description:
    "Privacy-safe prompt intelligence built from opt-in contributor activity. Pollen publishes aggregate patterns, never raw prompts, code, or tool output.",
  openGraph: {
    title: "Pollen | The Shared Intelligence Network",
    description:
      "Opt in to privacy-safe prompt intelligence. Pollen publishes aggregate patterns, never raw prompts.",
    type: "website",
    siteName: "Pollen",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pollen | The Shared Intelligence Network",
    description:
      "Opt in to privacy-safe prompt intelligence. Pollen publishes aggregate patterns, never raw prompts.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} light`} style={{ colorScheme: 'light' }}>
      <body>
        <RootProvider theme={{ forcedTheme: "light" }}>{children}</RootProvider>
      </body>
    </html>
  );
}
