"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, MessageSquareMore, UserRoundPlus } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export default function SignUpPage() {
  const router = useRouter();
  const { isAuthenticated, loading, setSession } = useAuth();
  const [redirectTo, setRedirectTo] = useState("/");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setRedirectTo(params.get("redirect") || "/");
  }, []);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, loading, redirectTo, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const data = await apiFetch<{
        token: string;
        user: Parameters<typeof setSession>[1];
      }>("/api/auth/signup", {
        method: "POST",
        json: {
          full_name: fullName,
          email,
          password,
        },
      });
      setSession(data.token, data.user);
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-10rem)] items-center gap-4 xl:grid-cols-[minmax(0,1.1fr)_480px]">
      <Card>
        <CardHeader>
          <Badge className="w-fit">New Account</Badge>
          <CardTitle className="max-w-2xl text-4xl">
            Create your workspace and connect the sources that already know your business.
          </CardTitle>
          <CardDescription className="max-w-xl text-base">
            Start with email and password, then connect Google and Slack from the ingest surface to replace manual entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: UserRoundPlus,
              title: "Personal workspace",
              body: "Each account gets its own feed, guide history, meetings, and privacy archive.",
            },
            {
              icon: CalendarDays,
              title: "Calendar prep",
              body: "Pull upcoming meetings from Google Calendar instead of creating them manually.",
            },
            {
              icon: MessageSquareMore,
              title: "Slack sync",
              body: "Bring recent channel context into the feed with one Slack connection.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-[24px] border border-white/10 bg-black/30 p-4"
            >
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                <Icon className="h-4 w-4 text-zinc-100" />
              </div>
              <p className="mono-label mb-2">{title}</p>
              <p className="text-sm leading-7 text-zinc-400">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Sign Up
          </Badge>
          <CardTitle className="text-3xl">Create account.</CardTitle>
          <CardDescription>
            Use a work email and a password with at least 8 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="mono-label">Full Name</label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Founder"
              />
            </div>
            <div className="space-y-2">
              <label className="mono-label">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="founder@company.com"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="mono-label">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
            </div>

            {error ? (
              <div className="rounded-[20px] border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-300">
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Creating Account..." : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-zinc-200 underline-offset-4 hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
