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
  { href: "/", label: "Pulse" },
  { href: "/guide", label: "Mentor" },
  { href: "/ingest", label: "Inputs" },
  { href: "/workers", label: "Workers" },
  { href: "/meetings", label: "Prep" },
  { href: "/privacy", label: "Memory" },
];

function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, isAuthenticated, signOut } = useAuth();
  const isAuthPage = pathname === "/sign-in" || pathname === "/sign-up";

  return (
    <header className="top-app-bar">
      <div className="top-app-bar-content">
        <div className="flex items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-4 transition-opacity hover:opacity-80">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-on-primary-container shadow-soft">
              <Radar className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xl font-medium tracking-tight text-on-surface">
                Founder OS
              </div>
              <div className="text-xs font-medium tracking-wide text-on-surface-variant">
                Control Room
              </div>
            </div>
          </Link>
        </div>

        <nav className="flex items-center justify-center">
          <div className="nav-bar">
            {navigation.map(({ href, label }) => {
              const isActive = pathname === href;
              return (
                <Link key={href} href={href} className="relative inline-flex interactive">
                  {isActive && (
                    <motion.span
                      layoutId="active-nav-pill"
                      className="absolute inset-0 rounded-full bg-primary shadow-soft"
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                    />
                  )}
                  <div className="state-layer" />
                  <span className={cn("nav-item", isActive && "active")}>
                    {label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <ThemeToggle />
          {loading ? (
            <div className="h-10 w-[164px] animate-pulse rounded-full bg-surface-high" />
          ) : isAuthenticated && user ? (
            <>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="sm" className="hidden sm:flex gap-2.5">
                    <CircleUser className="h-5 w-5 text-on-secondary-container" />
                    <span className="text-sm font-medium tracking-wide text-on-secondary-container">
                      {user.full_name || "User"}
                    </span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md rounded-[28px] border-none shadow-soft-lg">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-medium tracking-tight">User Profile</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="rounded-[28px] bg-surface-high px-6 py-5">
                      <div className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">Workspace</div>
                      <div className="mt-2 text-lg font-medium tracking-tight text-on-surface">
                        {user.full_name || user.email}
                      </div>
                      <div className="mt-1 text-sm text-on-surface-variant">{user.email}</div>
                    </div>
                    <div className="grid gap-3 rounded-[28px] bg-surface-variant px-6 py-5">
                      <div className="flex items-center gap-2 text-on-surface">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium tracking-wide">
                          {user.public_key ? "Private encryption active" : "Private encryption pending"}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-on-surface-variant">
                        {user.public_key
                          ? "Local key material is safely attached to this account."
                          : "Encrypted workspace setup is incomplete for this account. Re-run sign up with the same email once to initialize the vault key."}
                      </p>
                    </div>
                    <div className="grid gap-1 px-2">
                      <label className="text-xs font-medium text-on-surface-variant uppercase tracking-widest">User ID</label>
                      <p className="text-sm font-mono break-all text-on-surface/80">{user.id}</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-full px-6"
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
                <Button asChild size="sm" variant="ghost" className="px-5">
                  <Link href="/sign-in">Sign In</Link>
                </Button>
              )}
              <Button asChild size="sm" className="px-6">
                <Link href="/sign-up">Sign Up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export { NavBar };
