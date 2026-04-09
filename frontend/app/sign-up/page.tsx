"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, MessageSquareMore, UserRoundPlus } from "lucide-react";

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
import {
  deriveMasterKey,
  exportPublicKeyPem,
  generateKeyPair,
  generateSalt,
  wrapPrivateKey,
} from "@/lib/crypto";

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
      const salt = generateSalt();
      const masterKey = await deriveMasterKey(password, salt);
      const keyPair = await generateKeyPair();
      const publicKey = await exportPublicKeyPem(keyPair.publicKey);
      const encryptedPrivateKey = await wrapPrivateKey(keyPair.privateKey, masterKey);

      const data = await apiFetch<{
        token: string;
        user: Parameters<typeof setSession>[1];
        encrypted_private_key?: string | null;
      }>("/api/auth/signup", {
        method: "POST",
        json: {
          full_name: fullName,
          email,
          password,
          salt,
          public_key: publicKey,
          encrypted_private_key: encryptedPrivateKey,
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
    <div className="grid min-h-[calc(100vh-10rem)] items-center gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
      <Card className="border-2 border-border bg-card shadow-pixel bg-card">
        <CardHeader>
          <Badge className="w-fit">New Account</Badge>
          <CardTitle className="max-w-2xl font-sans text-4xl font-black uppercase tracking-[-0.05em]">
            Create your workspace and connect the sources that already know your business.
          </CardTitle>
          <CardDescription className="max-w-2xl text-base">
            Start with email and password, then connect Google and Slack from the ingest surface to replace manual entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-border px-4 py-4 shadow-pixel bg-background">
            <p className="mono-label text-foreground/50">What gets created</p>
            <p className="mt-3 text-sm leading-7 text-foreground/75">
              A private operator workspace with notifications, meetings, promises, drafts, archive memory, and connected-source sync.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-border bg-card shadow-pixel">
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Sign Up
          </Badge>
          <CardTitle className="font-sans text-3xl font-black uppercase tracking-tight">Create account.</CardTitle>
          <CardDescription>
            Use a work email and a password with at least 8 characters.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Founder"
              />
            </div>
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
                placeholder="At least 8 characters"
                required
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Sign up failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting ? "Creating Account..." : "Create Account"}
            </Button>
          </form>

          <div className="mt-6 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
