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
  Layers,
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
      <div className="mx-auto flex max-w-7xl flex-col gap-4 border-2 border-black bg-[#fff7e8] px-4 py-3 shadow-[8px_8px_0_0_#000] sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="flex h-11 w-11 items-center justify-center border-2 border-black bg-[#ffde59] text-black shadow-[4px_4px_0_0_#000]">
              <Radar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-black uppercase tracking-[-0.05em] text-foreground">
                Founder OS
              </div>
              <div className="mono-label text-black/45">active ai organization</div>
            </div>
          </Link>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <nav className="flex flex-wrap items-center gap-1 sm:gap-2">
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
                      "relative z-10 flex items-center gap-2 border-2 border-black px-3 py-2 text-sm font-black uppercase tracking-[0.08em] transition-all",
                      isActive ? "bg-[#ffde59] text-black shadow-[4px_4px_0_0_#000]" : "bg-white text-black hover:bg-[#dff2ff] hover:shadow-[4px_4px_0_0_#000]"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline-block">{label}</span>
                  </span>
                </Link>
              );
            })}
          </nav>

          {loading ? (
            <div className="h-12 w-[180px] animate-pulse border-2 border-black bg-white" />
          ) : isAuthenticated && user ? (
            <div className="flex items-center gap-3 border-t-2 border-black pt-4 lg:border-l-2 lg:border-t-0 lg:pl-4 lg:pt-0">
              <div className="flex items-center gap-2">
                 <CircleUser className="h-5 w-5 text-muted-foreground" />
                 <span className="text-sm font-black uppercase tracking-[0.08em] text-foreground">{user.full_name || "User"}</span>
              </div>
              <ThemeToggle />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  signOut();
                  router.push("/sign-in");
                }}
              >
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 border-t-2 border-black pt-4 lg:border-l-2 lg:border-t-0 lg:pl-4 lg:pt-0">
              <ThemeToggle />
              {!isAuthPage && (
                <Button asChild size="sm" variant="ghost">
                  <Link href="/sign-in">Sign In</Link>
                </Button>
              )}
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
