"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Inbox,
  LayoutDashboard,
  BriefcaseBusiness,
  Shield,
  Sparkles,
  CircleUser,
  Radar,
  ShieldCheck
} from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Pulse", icon: LayoutDashboard },
  { href: "/guide", label: "Mentor", icon: Sparkles },
  { href: "/ingest", label: "Inputs", icon: Inbox },
  { href: "/workers", label: "Workers", icon: BriefcaseBusiness },
  { href: "/meetings", label: "Prep", icon: CalendarDays },
  { href: "/privacy", label: "Memory", icon: Shield },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAuthenticated, signOut } = useAuth();
  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

  return (
    <header className="sticky top-0 z-50 mb-8 w-full bg-background/95 py-3 backdrop-blur">
      <div className="mx-auto grid max-w-7xl gap-4 border-b border-border pb-4 lg:grid-cols-[240px_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-4 transition-opacity hover:opacity-80">
            <div className="flex h-12 w-12 items-center justify-center border border-border bg-primary text-primary-foreground">
              <Radar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xl font-black uppercase tracking-[-0.06em] text-foreground">
                Founder OS
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/45">
                founder control room
              </div>
            </div>
          </Link>
        </div>

        <nav className="grid gap-2 border-y border-border py-3 lg:flex lg:flex-wrap lg:items-center lg:justify-center lg:border-y-0 lg:py-0">
          <div className="hidden lg:block text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/40">
            Navigation
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {navigation.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <Link key={href} href={href} className="relative">
                  {isActive && (
                    <motion.span
                      layoutId="active-nav-pill"
                      className="absolute inset-0 bg-primary"
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10 flex items-center gap-2 border border-border px-3 py-2 text-sm font-black uppercase tracking-[0.08em] transition-colors",
                      isActive
                        ? "text-primary-foreground"
                        : "bg-background text-foreground hover:bg-secondary"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline-block">{label}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <ThemeToggle />
            {loading ? (
              <div className="h-9 w-[164px] animate-pulse border border-border bg-muted" />
            ) : isAuthenticated && user ? (
              <>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="hidden sm:flex gap-2 rounded-none border-border bg-background">
                      <CircleUser className="h-4 w-4 text-foreground" />
                      <span className="text-xs font-black uppercase tracking-[0.08em] text-foreground">
                        {user.full_name || "User"}
                      </span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md rounded-none border-border">
                    <DialogHeader>
                      <DialogTitle className="font-sans text-2xl font-black uppercase tracking-tight">User Profile</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="border border-border px-4 py-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Workspace</div>
                        <div className="mt-2 text-lg font-black uppercase tracking-[-0.04em] text-foreground">
                          {user.full_name || user.email}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{user.email}</div>
                      </div>
                      <div className="grid gap-3 border border-border px-4 py-4">
                        <div className="flex items-center gap-2 text-foreground">
                          <ShieldCheck className="h-4 w-4" />
                          <span className="text-xs font-black uppercase tracking-[0.16em]">
                            {user.public_key ? "Private workspace encryption active" : "Private workspace encryption pending"}
                          </span>
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {user.public_key
                            ? "Local key material is attached to this account."
                            : "This account can sign in, but private workspace encryption has not been initialized yet."}
                        </p>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">User ID</label>
                        <p className="text-sm font-mono break-all">{user.id}</p>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t border-border">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="rounded-none"
                        onClick={() => {
                          signOut();
                          router.push("/sign-in");
                        }}
                      >
                        Sign Out
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
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
    </header>
  );
}
