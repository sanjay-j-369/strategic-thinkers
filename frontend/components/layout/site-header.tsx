"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Inbox,
  LayoutDashboard,
  LogOut,
  Shield,
  Sparkles,
  SquareStack,
} from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
  const router = useRouter();
  const { user, loading, isAuthenticated, signOut } = useAuth();

  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

  return (
    <header className="sticky top-4 z-50 mb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 rounded-2xl border border-border bg-card/80 px-4 py-3 shadow-sm backdrop-blur lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background">
              <SquareStack className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Founder OS
              </div>
              <div className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                Intelligence Layer
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground lg:flex">
            <span className="h-2 w-2 rounded-full bg-foreground/70" />
            {isAuthenticated ? "Live context stream" : "Private workspace"}
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
                      className="absolute inset-0 rounded-full border border-border bg-accent"
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-10 flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors",
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {loading ? (
            <div className="h-10 w-[180px] rounded-full border border-border bg-background" />
          ) : isAuthenticated && user ? (
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="rounded-full border border-border bg-background px-4 py-2">
                <div className="text-sm font-medium text-foreground">
                  {user.full_name || user.email}
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {user.email}
                </div>
              </div>
              <ThemeToggle />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  signOut();
                  router.push("/sign-in");
                }}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <ThemeToggle />
              {!isAuthPage ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/sign-in">Sign In</Link>
                </Button>
              ) : null}
              <Button asChild size="sm">
                <Link href="/sign-up">Sign Up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
