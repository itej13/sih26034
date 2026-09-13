"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/capture", label: "New scan" },
  { href: "/history", label: "History" },
  { href: "/dashboard", label: "Dashboard" },
];

/** Ruler's edge. Inline rather than a dependency — the project ships no icon library. */
function Mark() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" aria-hidden="true" focusable="false">
      <rect x="1.25" y="5.25" width="21.5" height="13.5" rx="2.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 5.75v5M10 5.75v3.2M14 5.75v5M18 5.75v3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur" aria-label="Primary navigation">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        {/* The only route home used to be an sr-only link, so a government-facing tool had no
            visible way back and no mark identifying itself to the panel it is shown to. */}
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className="-ml-2 flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-brand transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Mark />
          <span className="hidden leading-tight sm:block">
            <span className="block text-[13px] font-bold tracking-tight text-ink">Legal Metrology Inspection</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Dept. of Consumer Affairs</span>
          </span>
          <span className="sr-only sm:hidden">Legal Metrology Inspection — home</span>
        </Link>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-11 items-center rounded-lg px-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-3 sm:text-sm ${
                  active ? "bg-brand-soft text-brand" : "text-ink-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                {link.label}
                {/* Colour alone does not mark the current route: an underline carries it too. */}
                {active && <span className="absolute inset-x-2.5 bottom-1 h-0.5 rounded-full bg-brand sm:inset-x-3" aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
