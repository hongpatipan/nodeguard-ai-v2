"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShieldCheck, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Review", icon: Terminal },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function PageNav() {
  const pathname = usePathname();

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-primary">
        <ShieldCheck className="h-5 w-5" />
        <span className="font-mono text-sm">NodeGuard AI</span>
        <span className="text-xs text-muted-foreground">(Gemini Edition)</span>
      </div>
      <nav className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
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
