import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lisenbart.games"),
  title: {
    default: "Lisenbart Games Animation",
    template: "%s · Lisenbart Games",
  },
  description:
    "Motion studio for games. Slot features, bonus games, and character work for iGaming. SuperPlay MGX is in production.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Lisenbart Games Animation",
    description: "Motion studio for games. SuperPlay MGX is in production.",
    url: "https://lisenbart.games/",
    siteName: "Lisenbart Games",
    type: "website",
    images: [{ url: "/logo.png", alt: "Lisenbart Games Animation" }],
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
