"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

export default function SignInPage() {
  const router = useRouter();
  const { isAuthenticated, loading, setSession } = useAuth();
  const [redirectTo, setRedirectTo] = useState("/");

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
      }>("/api/auth/signin", {
        method: "POST",
        json: { email, password },
      });
      setSession(data.token, data.user);
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-10rem)] items-center gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
      <Card className="neo-card bg-[#fff7e8]">
        <CardHeader>
          <Badge className="w-fit">Private Workspace</Badge>
          <CardTitle className="max-w-2xl font-sans text-4xl font-black uppercase tracking-[-0.05em]">
            Sign in to access your synced founder context.
          </CardTitle>
          <CardDescription className="max-w-2xl text-base">
            Once signed in, you can connect Google Calendar, Gmail, and Slack and stop pasting context manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="neo-stat bg-white">
            <p className="mono-label text-black/50">What unlocks after sign in</p>
            <p className="mt-3 text-sm leading-7 text-black/75">
              Google sync, Slack sync, live assistant notifications, promise tracking, draft replies, mentor runs, and private memory review.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="neo-card">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Sign In
          </Badge>
          <CardTitle className="font-sans text-3xl font-black uppercase tracking-tight">Welcome back.</CardTitle>
          <CardDescription>
            Use your email and password to open your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="founder@company.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Sign in failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Signing In..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-sm text-muted-foreground">
            Need an account?{" "}
            <Link href="/sign-up" className="text-foreground underline-offset-4 hover:underline">
              Create one
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
