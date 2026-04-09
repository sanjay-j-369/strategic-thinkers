"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlarmClock, ArrowRight, Bell, BriefcaseBusiness, Inbox, Layers3, Sparkles } from "lucide-react";

import { SignalCard, type SignalItem } from "@/components/SignalCard";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useFounderFeed } from "@/lib/websocket";

interface PromiseItem {
  id: string;
  promise_text: string;
  status: string;
  created_at: string;
}

interface DraftItem {
  id: string;
  channel: string;
  prompt: string;
  draft_text: string;
  created_at: string;
}

export default function FeedPage() {
  const { user, token, isAuthenticated, loading } = useAuth();
  const signals = useFounderFeed(user?.id ?? "", token);
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    let active = true;

    async function loadOps() {
      try {
        const [promiseData, draftData] = await Promise.all([
          apiFetch<{ items: PromiseItem[] }>("/api/ops/promises?limit=6", { token }),
          apiFetch<{ items: DraftItem[] }>("/api/ops/drafts?limit=4", { token }),
        ]);
        if (!active) return;
        setPromises(promiseData.items || []);
        setDrafts(draftData.items || []);
      } catch {
        if (!active) return;
        setPromises([]);
        setDrafts([]);
      }
    }

    void loadOps();
    const timer = setInterval(() => {
      void loadOps();
    }, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, isAuthenticated]);

  useEffect(() => {
    if (!demoMode || !token || !isAuthenticated) return;
    let mounted = true;
    async function loadSnapshot() {
      try {
        const data = await apiFetch<any>("/api/demo/snapshot", { token });
        if (mounted) setSnapshot(data);
      } catch {
        if (mounted) setSnapshot(null);
      }
    }
    void loadSnapshot();
    const timer = setInterval(() => void loadSnapshot(), 8000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [demoMode, token, isAuthenticated]);

  const metrics = useMemo(() => {
    const unread = signals.filter((item) => !item.read_at).length;
    const workerAlerts = signals.filter((item) => item.pillar === "WORKER").length;
    const mentorAlerts = signals.filter(
      (item) => item.pillar === "MENTOR" || item.notification_type === "GUIDE_QUERY"
    ).length;
    return [
      { label: "Unread Signals", value: unread, icon: Bell },
      { label: "Open Promises", value: promises.length, icon: AlarmClock },
      { label: "Draft Replies", value: drafts.length, icon: Inbox },
      { label: "Worker Alerts", value: workerAlerts, icon: BriefcaseBusiness },
      { label: "Mentor Notes", value: mentorAlerts, icon: Sparkles },
    ];
  }, [drafts.length, promises.length, signals]);

  const featured = signals.slice(0, 8);

  return (
    <div className="space-y-8">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_420px]">
        <Card className="border-2 border-border bg-card shadow-pixel overflow-hidden bg-primary text-primary-foreground">
          <CardHeader className="gap-6 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Active AI Organization</Badge>
              <Badge variant="outline">Workers / Assistant / Mentor</Badge>
            </div>
            <div className="space-y-4">
              <CardTitle className="max-w-4xl font-sans text-5xl font-black uppercase tracking-[-0.06em] md:text-7xl text-primary-foreground">
                Founder control room.
              </CardTitle>
              <CardDescription className="max-w-3xl text-lg leading-8 text-primary-foreground/80">
                The backend now runs like an operating system: background workers surface blockers, the assistant tracks promises and drafts replies, and the mentor flags strategic risk before it becomes obvious.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 border-t-2 border-border pt-6">
            {isAuthenticated ? (
              <>
                <Button asChild size="lg">
                  <Link href="/guide">
                    Queue Mentor Question
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/ingest">Connect Sources</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link href="/sign-up">Create Workspace</Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/sign-in">Sign In</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 border-border bg-card shadow-pixel bg-card text-card-foreground">
          <CardHeader>
            <Badge>Operator Snapshot</Badge>
            <CardTitle className="font-sans text-3xl font-black uppercase tracking-[-0.05em]">
              {isAuthenticated ? "Live" : "Locked"}
            </CardTitle>
            <CardDescription className="text-base text-card-foreground/70">
              {isAuthenticated
                ? "Websocket notifications stream in as the background organization runs."
                : "Authenticate to unlock founder-specific operations, signals, drafts, and prep."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="border-2 border-border px-4 py-4 shadow-pixel bg-background text-foreground">
              <p className="mono-label text-foreground/50">Current identity</p>
              <p className="mt-2 text-2xl font-black uppercase tracking-tight">
                {user?.full_name || user?.email || "anonymous"}
              </p>
            </div>
            <div className="border-2 border-border px-4 py-4 shadow-pixel bg-primary text-primary-foreground">
              <p className="mono-label text-primary-foreground/60">Signal volume</p>
              <p className="mt-2 text-4xl font-black">{signals.length}</p>
            </div>
            {demoMode && snapshot?.profile ? (
              <div className="border-2 border-border px-4 py-4 shadow-pixel bg-background text-foreground">
                <p className="mono-label text-foreground/60">Demo runway</p>
                <p className="mt-2 text-3xl font-black">{snapshot.profile.runway_months ?? "-"} mo</p>
                <p className="mt-1 text-sm font-medium">${Math.round(snapshot.profile.mrr_usd || 0).toLocaleString()} MRR</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ label, value, icon: Icon }, index) => (
          <Card key={label} className="border-2 border-border bg-card shadow-pixel">
            <CardContent className="pt-6">
              <div
                className={`mb-4 flex h-12 w-12 items-center justify-center border-2 border-border ${
                  index % 2 === 0 ? "bg-primary text-primary-foreground" : "bg-background text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <p className="mono-label text-foreground/50">{label}</p>
              <p className="mt-3 text-4xl font-black tracking-[-0.08em] text-foreground">{value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="mono-label text-foreground/50">Live feed</p>
              <h2 className="mt-2 text-4xl font-black uppercase tracking-[-0.06em] text-foreground">
                Signals from the org
              </h2>
            </div>
            <Badge variant="outline">{featured.length} visible</Badge>
          </div>

          {loading ? (
            <Card className="border-2 border-border bg-card shadow-pixel">
              <CardContent className="py-20 text-center text-sm text-foreground/60">
                Loading operator surface...
              </CardContent>
            </Card>
          ) : !isAuthenticated ? (
            <Card className="border-2 border-border bg-card shadow-pixel">
              <CardContent className="space-y-4 py-16 text-center">
                <Layers3 className="mx-auto h-10 w-10 text-foreground" />
                <h3 className="text-2xl font-black uppercase text-foreground">Private feed locked</h3>
                <p className="mx-auto max-w-2xl text-sm leading-7 text-foreground/65">
                  Sign in to see live worker alerts, mentor notes, meeting prep, promise tracking, and drafts generated in the background.
                </p>
              </CardContent>
            </Card>
          ) : featured.length === 0 ? (
            <Card className="border-2 border-border bg-card shadow-pixel">
              <CardContent className="space-y-4 py-16 text-center">
                <Bell className="mx-auto h-10 w-10 text-foreground" />
                <h3 className="text-2xl font-black uppercase text-foreground">Waiting for the first signal</h3>
                <p className="mx-auto max-w-2xl text-sm leading-7 text-foreground/65">
                  Connect sources or push a manual ingest event. The assistant and workers will start filing alerts here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {featured.map((signal, index) => (
                <motion.div
                  key={signal.id || `${signal.notification_type}-${signal.created_at}-${index}`}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: index * 0.03 }}
                >
                  <SignalCard signal={signal as SignalItem} />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="border-2 border-border bg-card shadow-pixel bg-card">
            <CardHeader>
              <Badge variant="outline">Promise tracker</Badge>
              <CardTitle className="font-sans text-2xl font-black uppercase tracking-tight">Open commitments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {promises.length === 0 ? (
                <p className="text-sm leading-7 text-foreground/60">No open promises detected yet.</p>
              ) : (
                promises.map((item) => (
                  <div key={item.id} className="border-2 border-border px-4 py-4 shadow-pixel bg-background">
                    <p className="text-sm font-medium leading-7 text-foreground">{item.promise_text}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-foreground/45">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-2 border-border bg-card shadow-pixel bg-card">
            <CardHeader>
              <Badge variant="outline">Auto drafting</Badge>
              <CardTitle className="font-sans text-2xl font-black uppercase tracking-tight">Draft queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {drafts.length === 0 ? (
                <p className="text-sm leading-7 text-foreground/60">No suggested replies are waiting for review.</p>
              ) : (
                drafts.map((item) => (
                  <div key={item.id} className="border-2 border-border px-4 py-4 shadow-pixel bg-background">
                    <p className="mono-label text-foreground/50">{item.channel}</p>
                    <p className="mt-2 text-sm font-semibold uppercase tracking-[0.08em] text-foreground">{item.prompt}</p>
                    <p className="mt-3 text-sm leading-7 text-foreground/75">{item.draft_text.slice(0, 180)}{item.draft_text.length > 180 ? "..." : ""}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
