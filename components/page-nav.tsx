"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Review", icon: Terminal },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

// โลโก้ shield + checkmark แบบเดียวกับ app/icon.svg และ app/opengraph-image.tsx
// (เก็บ path ให้ตรงกันทั้ง 3 ที่ เพื่อความเป็นแบรนด์เดียวกัน)
function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
      <path
        d="M11 16.2 L14.3 19.5 L21 12.5"
        fill="none"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PageNav() {
  const pathname = usePathname();

  return (
    <div className="mb-10 flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-5">
      <div className="flex items-center gap-2.5">
        <LogoMark />
        <div className="flex items-baseline gap-2">
          <span className="font-display text-base font-semibold tracking-tight">NodeGuard AI</span>
          <span className="text-xs text-muted-foreground">Gemini Edition</span>
        </div>
      </div>
      <nav className="flex items-center gap-1 rounded-lg border border-border/80 bg-card/60 p-1 backdrop-blur">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <link.icon className="h-3.5 w-3.5" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
