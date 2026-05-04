"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  unwrapPrivateKey,
  wrapPrivateKey,
} from "@/lib/crypto";

export default function SignUpPage() {
  const router = useRouter();
  const { isAuthenticated, loading, setPrivateKey, setSession } = useAuth();
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
      const keyPair = await generateKeyPair();
      const publicKey = await exportPublicKeyPem(keyPair.publicKey);
      const salt = generateSalt();
      const masterKey = await deriveMasterKey(password, salt);
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
      if (data.encrypted_private_key === encryptedPrivateKey) {
        setPrivateKey(keyPair.privateKey);
      } else if (data.encrypted_private_key) {
        const masterKey = await deriveMasterKey(password, salt);
        const restoredPrivateKey = await unwrapPrivateKey(
          data.encrypted_private_key,
          masterKey
        );
        setPrivateKey(restoredPrivateKey);
      }
      setSession(data.token, data.user);
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-12rem)] items-center gap-8 xl:grid-cols-[minmax(0,1fr)_480px]">
      <Card className="bg-surface">
        <CardHeader className="gap-4">
          <Badge variant="secondary">New Account</Badge>
          <CardTitle className="max-w-2xl text-3xl font-medium tracking-tight text-on-surface">
            Create your workspace and connect the sources that already know your business.
          </CardTitle>
          <CardDescription className="max-w-2xl text-base text-on-surface-variant">
            Start with email and password, then connect Google and Slack from the ingest surface to replace manual entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl surface-high px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">What gets created</p>
            <p className="mt-2 text-sm leading-7 text-on-surface">
              A private operator workspace with notifications, meetings, promises, drafts, archive memory, and connected-source sync.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-surface">
        <CardHeader className="gap-4">
          <Badge>Sign Up</Badge>
          <CardTitle className="text-3xl font-medium tracking-tight text-on-surface">Create account.</CardTitle>
          <CardDescription className="text-on-surface-variant">
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
            <div className="rounded-xl surface-high px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
                End-to-end encrypted by default
              </p>
              <p className="mt-2 text-sm leading-7 text-on-surface">
                Founder OS stores only your client-wrapped private key. Background systems can prepare drafts, but only you can open the workspace and explicitly send them.
              </p>
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

          <div className="mt-6 text-sm text-on-surface-variant">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary font-medium underline-offset-4 hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
