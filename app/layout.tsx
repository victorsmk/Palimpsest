import type { Metadata } from "next";
import { Literata, DM_Sans } from "next/font/google";
import "./globals.css";

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Palimpsest — Found Poetry & Erasure Workshop",
  description: "Discover hidden poetry inside classic literary texts by erasing words.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${literata.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#F3EBDD] text-[#24231F]">
        {children}
      </body>
    </html>
  );
}
