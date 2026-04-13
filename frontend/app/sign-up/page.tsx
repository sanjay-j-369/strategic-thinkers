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
  exportPrivateKeyPem,
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
  const [securityMode, setSecurityMode] = useState<"magic" | "vault">("magic");
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
      let salt: string | undefined;
      let encryptedPrivateKey: string | undefined;
      let rawPrivateKey: string | undefined;

      if (securityMode === "vault") {
        salt = generateSalt();
        const masterKey = await deriveMasterKey(password, salt);
        encryptedPrivateKey = await wrapPrivateKey(keyPair.privateKey, masterKey);
      } else {
        rawPrivateKey = await exportPrivateKeyPem(keyPair.privateKey);
      }

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
          security_mode: securityMode,
          salt,
          public_key: publicKey,
          encrypted_private_key: encryptedPrivateKey,
          raw_private_key: rawPrivateKey,
        },
      });
      if (securityMode === "vault" && data.encrypted_private_key === encryptedPrivateKey) {
        setPrivateKey(keyPair.privateKey);
      } else if (securityMode === "vault" && data.encrypted_private_key && salt) {
        const masterKey = await deriveMasterKey(password, salt);
        const restoredPrivateKey = await unwrapPrivateKey(
          data.encrypted_private_key,
          masterKey
        );
        setPrivateKey(restoredPrivateKey);
      } else {
        setPrivateKey(keyPair.privateKey);
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
    <div className="grid min-h-[calc(100vh-10rem)] items-center gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
      <Card className="border border-border bg-card  bg-card">
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
          <div className="border border-border px-4 py-4  bg-background">
            <p className="mono-label text-foreground/50">What gets created</p>
            <p className="mt-3 text-sm leading-7 text-foreground/75">
              A private operator workspace with notifications, meetings, promises, drafts, archive memory, and connected-source sync.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border bg-card ">
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

            <div className="space-y-3">
              <Label>Security Mode</Label>
              <div className="grid gap-0 border border-neutral-300 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSecurityMode("magic")}
                  className={`grid gap-2 px-4 py-4 text-left ${
                    securityMode === "magic" ? "bg-black text-white" : "bg-white text-black"
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-[0.18em]">
                    Magic Mode (Recommended)
                  </span>
                  <span className="text-sm leading-6 opacity-80">
                    Allow Founder OS to draft emails and send background reports 24/7.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSecurityMode("vault")}
                  className={`grid gap-2 border-t border-neutral-300 px-4 py-4 text-left md:border-l md:border-t-0 ${
                    securityMode === "vault" ? "bg-black text-white" : "bg-white text-black"
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-[0.18em]">
                    Vault Mode
                  </span>
                  <span className="text-sm leading-6 opacity-80">
                    Maximum security. Founder OS cannot read data offline. You must open the app to sync drafts.
                  </span>
                </button>
              </div>
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
