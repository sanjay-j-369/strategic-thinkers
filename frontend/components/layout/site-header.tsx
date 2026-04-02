"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Inbox,
  LayoutDashboard,
  Shield,
  Sparkles,
  SquareStack,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Feed", icon: LayoutDashboard },
  { href: "/guide", label: "Guide", icon: Sparkles },
  { href: "/ingest", label: "Ingest", icon: Inbox },
  { href: "/meetings", label: "Meetings", icon: CalendarDays },
  { href: "/privacy", label: "Privacy", icon: Shield },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-4 z-50 mb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 rounded-[30px] border border-white/10 bg-black/55 px-4 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <SquareStack className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                Founder OS
              </div>
              <div className="text-sm font-semibold tracking-[-0.02em] text-zinc-100">
                Intelligence Layer
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-mono uppercase tracking-[0.24em] text-zinc-500 lg:flex">
            <span className="h-2 w-2 rounded-full bg-white/70" />
            Live context stream
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <nav className="flex flex-wrap items-center gap-1">
            {navigation.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;

              return (
                <Link key={href} href={href} className="relative">
                  {isActive ? (
                    <motion.span
                      layoutId="active-nav-pill"
                      className="absolute inset-0 rounded-full border border-white/15 bg-white/[0.08]"
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-10 flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors",
                      isActive ? "text-white" : "text-zinc-400 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <Button asChild size="sm" variant="secondary" className="self-start lg:self-auto">
            <Link href="/guide">
              Open Guide
              <Sparkles className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
