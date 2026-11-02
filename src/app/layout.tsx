import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Unbounded } from "next/font/google";
import { SiteNav } from "./nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Познай песента",
  description: "Музикална игра с фокус върху българската поп-фолк музика",
};

export const viewport: Viewport = {
  themeColor: "#0d0817",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-base shadow-lg shadow-accent/30" aria-hidden>
        ♪
      </span>
      <span className="font-display text-base font-bold tracking-tight sm:text-lg">
        Познай <span className="text-gradient">песента</span>
      </span>
    </Link>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="bg" className={`${geistSans.variable} ${unbounded.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-background/70 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Logo />
            <SiteNav />
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">{children}</main>
        {/* На телефон долу има лента с табове — оставяме място за нея. */}
        <footer className="px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6 text-center text-xs text-muted sm:pb-8">
          Звук: 30-секундни откъси от Deezer · Не съхраняваме аудио
        </footer>
        <SiteNav mobile />
      </body>
    </html>
  );
}
