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
  // Pages name themselves ("Studio", "Discover"); the template adds the site name.
  title: {
    default: "Palimpsest — Found Poetry & Erasure Workshop",
    template: "%s · Palimpsest",
  },
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
        {/* First thing a keyboard user reaches: jump past the header to the page's main content. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded focus:bg-[#24231F] focus:px-3 focus:py-2 focus:text-sm focus:text-[#F3EBDD]"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
