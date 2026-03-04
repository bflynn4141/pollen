import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Prompt Trends — The Shared Intelligence Network",
  description:
    "Your prompts have value. Install one MCP server. Contribute anonymized intents, tool calls, command patterns, and model preferences. Earn tokens when the data is queried.",
  openGraph: {
    title: "Prompt Trends — The Shared Intelligence Network",
    description:
      "Your prompts have value. Contribute anonymized prompt intelligence and earn tokens.",
    type: "website",
    siteName: "Prompt Trends",
  },
  twitter: {
    card: "summary_large_image",
    title: "Prompt Trends — The Shared Intelligence Network",
    description:
      "Your prompts have value. Contribute anonymized prompt intelligence and earn tokens.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
