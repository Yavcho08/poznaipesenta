"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

const NAV = [
  { href: "/", label: "Игра", icon: "🎧" },
  { href: "/dnevno", label: "Дневно", icon: "📅" },
  { href: "/staya", label: "С приятели", icon: "👥" },
  { href: "/klasaciya", label: "Класация", icon: "🏆" },
  { href: "/vnos", label: "Внос", icon: "➕" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/igra");
  return pathname.startsWith(href);
}

/** Навигацията горе (на компютър). */
function Nav({ pathname }: { pathname: string }) {
  return (
    <ul className="hidden gap-0.5 text-sm sm:flex">
      {NAV.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className={`block whitespace-nowrap rounded-full px-3 py-2 transition ${
              isActive(pathname, item.href) ? "bg-surface-strong text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Долна лента с табове на телефон (удобно с палец). Трябва да е извън хедъра:
 * backdrop-filter там прави position: fixed относително към хедъра, не към екрана.
 */
function MobileNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Основна навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg sm:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${active ? "text-foreground" : "text-muted"}`}
              >
                <span className={`text-lg leading-none transition ${active ? "scale-110" : "opacity-60 grayscale"}`} aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function WithPathname({ render }: { render: (pathname: string) => ReactNode }) {
  return <>{render(usePathname())}</>;
}

/**
 * usePathname() е данни от URL — с cacheComponents трябва да е в <Suspense>.
 * Докато се зареди, навигацията се вижда същата, само без маркиран текущ таб.
 */
export function SiteNav({ mobile }: { mobile?: boolean }) {
  const view = (pathname: string) => (mobile ? <MobileNav pathname={pathname} /> : <Nav pathname={pathname} />);
  return (
    <Suspense fallback={view("")}>
      <WithPathname render={view} />
    </Suspense>
  );
}