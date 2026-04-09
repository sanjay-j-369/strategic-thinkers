"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Inbox,
  LayoutDashboard,
  Shield,
  Sparkles,
  CircleUser,
  Radar
} from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Pulse", icon: LayoutDashboard },
  { href: "/guide", label: "Mentor", icon: Sparkles },
  { href: "/ingest", label: "Inputs", icon: Inbox },
  { href: "/meetings", label: "Prep", icon: CalendarDays },
  { href: "/privacy", label: "Memory", icon: Shield },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAuthenticated, signOut } = useAuth();
  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

  return (
    <header className="sticky top-0 z-50 mb-8 w-full py-2">
      <div className="shadow-pixel-lg mx-auto flex max-w-7xl flex-col gap-4 border-2 border-border bg-card px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="shadow-pixel flex h-11 w-11 items-center justify-center border-2 border-border bg-primary text-primary-foreground">
              <Radar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-black uppercase tracking-[-0.05em] text-foreground">
                Founder OS
              </div>
              <div className="mono-label text-foreground/45">active ai organization</div>
            </div>
          </Link>
        </div>

        <div className="flex flex-col gap-4 lg:flex-1 lg:flex-row lg:items-center lg:justify-end">
          <nav className="flex flex-wrap items-center gap-2 lg:justify-center">
            {navigation.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link key={href} href={href} className="relative">
                  {isActive && (
                    <motion.span
                      layoutId="active-nav-pill"
                      className="absolute inset-0 rounded-full bg-primary/10"
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 flex items-center gap-2 border-2 border-border px-3 py-2 text-sm font-black uppercase tracking-[0.08em] transition-all",
                      isActive
                        ? "shadow-pixel bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline-block">{label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-2 border-t-2 border-border pt-4 lg:border-l-2 lg:border-t-0 lg:pl-4 lg:pt-0">
            <ThemeToggle />
            {loading ? (
              <div className="h-9 w-[164px] animate-pulse border-2 border-border bg-muted" />
            ) : isAuthenticated && user ? (
              <>
                <div className="hidden items-center gap-2 rounded-none border-2 border-border bg-secondary px-3 py-2 sm:flex">
                  <CircleUser className="h-4 w-4 text-foreground" />
                  <span className="text-xs font-black uppercase tracking-[0.08em] text-foreground">
                    {user.full_name || "User"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    signOut();
                    router.push("/sign-in");
                  }}
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                {!isAuthPage && (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/sign-in">Sign In</Link>
                  </Button>
                )}
                <Button asChild size="sm">
                  <Link href="/sign-up">Sign Up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
