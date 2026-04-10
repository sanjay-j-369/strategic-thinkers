"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlarmClock, ArrowRight, Bell, BriefcaseBusiness, Inbox, Layers3, Sparkles, Waves } from "lucide-react";

import { SignalCard, type SignalItem } from "@/components/SignalCard";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { extractPIITokens, replacePIITokens, resolvePIITokenValues } from "@/lib/pii";
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

interface OpsStatus {
  runner: {
    status: string;
    active_runners: number;
    poll_interval_seconds: number;
  };
  websocket: {
    user_connections: number;
    admin_connections: number;
  };
  queue: {
    counts: {
      pending: number;
      running: number;
      failed: number;
    };
    user_counts: {
      pending: number;
      running: number;
    };
    by_task_name: Record<string, number>;
  };
  workers: {
    active_runs: number;
    by_pillar: Record<string, number>;
  };
  active_ingestions: Array<{
    id: string;
    status: string;
    source?: string | null;
    topic?: string | null;
    trace_id?: string | null;
    preview: string;
    created_at: string;
    updated_at: string;
  }>;
}

interface AdminLogEvent {
  type: string;
  log_id: string;
  generated_at: string;
  user_id: string | null;
  pillar: string;
  agent_name: string;
  level: string;
  node_name?: string | null;
  step?: string | null;
  message: string;
}

function resolveWsBase(): string {
  const configured =
    process.env.NEXT_PUBLIC_WS_URL ||
    (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(/^http/, "ws");

  if (typeof window === "undefined") {
    return configured;
  }

  const browserHost = window.location.hostname;
  const browserIsLocal = browserHost === "localhost" || browserHost === "127.0.0.1";
  const configuredIsLocal = configured.includes("localhost") || configured.includes("127.0.0.1");

  if (!browserIsLocal && configuredIsLocal) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/backend-api`;
  }

  return configured;
}

export default function FeedPage() {
  const { user, token, privateKey, isAuthenticated, loading } = useAuth();
  const signals = useFounderFeed(user?.id ?? "", token);
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [opsStatus, setOpsStatus] = useState<OpsStatus | null>(null);
  const [piiMap, setPiiMap] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<AdminLogEvent[]>([]);
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">("closed");
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const logsViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    let active = true;

    async function loadOps() {
      try {
        const [promiseData, draftData, statusData] = await Promise.all([
          apiFetch<{ items: PromiseItem[] }>("/api/ops/promises?limit=6", { token }),
          apiFetch<{ items: DraftItem[] }>("/api/ops/drafts?limit=4", { token }),
          apiFetch<OpsStatus>("/api/ops/system-status", { token }),
        ]);
        if (!active) return;
        setPromises(promiseData.items || []);
        setDrafts(draftData.items || []);
        setOpsStatus(statusData);
      } catch {
        if (!active) return;
        setPromises([]);
        setDrafts([]);
        setOpsStatus(null);
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

  useEffect(() => {
    if (!demoMode || !isAuthenticated || !user?.id) return;
    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      if (!active) return;
      setSocketState("connecting");
      const ws = new WebSocket(`${resolveWsBase()}/ws/admin/logs`);

      ws.onopen = () => {
        setSocketState("open");
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data) as AdminLogEvent;
        if (payload.user_id && payload.user_id !== user.id) return;
        setLogs((current) => [payload, ...current].slice(0, 80));
      };

      ws.onerror = () => {
        setSocketState("closed");
      };

      ws.onclose = () => {
        setSocketState("closed");
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (!active) return;
        reconnectTimer = setTimeout(connect, 2500);
      };
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    };
  }, [demoMode, isAuthenticated, user?.id]);

  useEffect(() => {
    if (!logsViewportRef.current) return;
    logsViewportRef.current.scrollTop = 0;
  }, [logs]);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    const authToken = token;
    let active = true;

    async function loadPIIMap() {
      const tokens = [
        ...signals.flatMap((item) => [
          ...extractPIITokens(item.title),
          ...extractPIITokens(item.body),
          ...Object.values(item.payload || {}).flatMap((value) =>
            typeof value === "string" ? extractPIITokens(value) : []
          ),
        ]),
        ...promises.flatMap((item) => extractPIITokens(item.promise_text)),
        ...drafts.flatMap((item) => [
          ...extractPIITokens(item.prompt),
          ...extractPIITokens(item.draft_text),
        ]),
      ];

      const unresolved = Array.from(new Set(tokens)).filter((tokenValue) => !(tokenValue in piiMap));
      if (unresolved.length === 0) return;

      try {
        const resolved = await resolvePIITokenValues(unresolved, authToken, privateKey);
        if (!active) return;
        setPiiMap((current) => ({ ...current, ...resolved }));
      } catch {
        // Keep unresolved placeholders if token resolution fails.
      }
    }

    void loadPIIMap();
    return () => {
      active = false;
    };
  }, [drafts, isAuthenticated, piiMap, privateKey, promises, signals, token]);

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

  const featured = useMemo(
    () =>
      signals.slice(0, 8).map((signal) => ({
        ...signal,
        title: replacePIITokens(signal.title, piiMap),
        body: replacePIITokens(signal.body, piiMap),
        payload:
          signal.payload && typeof signal.payload === "object"
            ? Object.fromEntries(
                Object.entries(signal.payload).map(([key, value]) => [
                  key,
                  typeof value === "string" ? replacePIITokens(value, piiMap) : value,
                ])
              )
            : signal.payload,
      })),
    [piiMap, signals]
  );
  const visiblePromises = useMemo(
    () =>
      promises.map((item) => ({
        ...item,
        promise_text: replacePIITokens(item.promise_text, piiMap),
      })),
    [piiMap, promises]
  );
  const visibleDrafts = useMemo(
    () =>
      drafts.map((item) => ({
        ...item,
        prompt: replacePIITokens(item.prompt, piiMap),
        draft_text: replacePIITokens(item.draft_text, piiMap),
      })),
    [drafts, piiMap]
  );
  const dashboardMetrics = opsStatus
    ? [
        { label: "Queue backlog", value: opsStatus.queue.counts.pending, accent: "bg-primary text-primary-foreground" },
        { label: "Running now", value: opsStatus.queue.counts.running, accent: "bg-background text-foreground" },
        { label: "Active workers", value: opsStatus.workers.active_runs, accent: "bg-background text-foreground" },
        { label: "Socket links", value: opsStatus.websocket.user_connections, accent: "bg-primary text-primary-foreground" },
      ]
    : [];

  return (
    <div className="space-y-8">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_420px]">
        <Card className="panel-pro overflow-hidden bg-primary text-primary-foreground">
          <CardHeader className="gap-6 pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Active AI Organization</Badge>
              <Badge variant="outline">Workers / Assistant / Mentor</Badge>
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 px-3 py-1 text-xs uppercase tracking-[0.18em] text-primary-foreground/80">
                <span className="live-dot bg-primary-foreground" />
                Live pipeline
              </span>
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

        <Card className="panel-pro bg-card text-card-foreground">
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

      <section className="neo-marquee border-2 border-border bg-foreground py-3 text-background">
        <div className="neo-marquee-track text-sm font-black uppercase tracking-[0.24em]">
          <span>Founder OS</span>
          <span>Live Pipeline</span>
          <span>Workers Online</span>
          <span>Assistant Watch</span>
          <span>Mentor Signals</span>
          <span>Encrypted Memory</span>
          <span>Founder OS</span>
          <span>Live Pipeline</span>
          <span>Workers Online</span>
          <span>Assistant Watch</span>
          <span>Mentor Signals</span>
          <span>Encrypted Memory</span>
        </div>
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

      {isAuthenticated ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_360px]">
          <Card className="panel-pro">
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Runtime Dashboard</Badge>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs uppercase tracking-[0.18em] text-foreground/65">
                  <span className="live-dot" />
                  Live state
                </span>
              </div>
              <CardTitle className="font-sans text-3xl font-black uppercase tracking-[-0.05em]">
                Queue and worker status
              </CardTitle>
              <CardDescription className="text-base">
                Live view of the task runner, queue pressure, active worker lanes, and the founder events currently moving through ingestion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {opsStatus ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {dashboardMetrics.map((metric) => (
                      <motion.div
                        key={metric.label}
                        className={`pipeline-bar rounded-[1.2rem] border border-border/70 px-4 py-4 shadow-lg ${metric.accent}`}
                        animate={{ y: [0, -2, 0] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <p className="mono-label opacity-70">{metric.label}</p>
                        <p className="mt-2 text-4xl font-black tracking-[-0.08em]">{metric.value}</p>
                      </motion.div>
                    ))}
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-[1.2rem] border border-border/70 px-4 py-4 shadow-lg bg-background">
                      <p className="mono-label text-foreground/50">Task runner</p>
                      <p className="mt-2 flex items-center gap-3 text-2xl font-black uppercase text-foreground">
                        <span className="live-dot" />
                        {opsStatus.runner.status}
                      </p>
                      <p className="mt-1 text-sm text-foreground/65">
                        Polls every {opsStatus.runner.poll_interval_seconds}s
                      </p>
                    </div>
                    <div className="rounded-[1.2rem] border border-border/70 px-4 py-4 shadow-lg bg-background">
                      <p className="mono-label text-foreground/50">Your queue</p>
                      <p className="mt-2 text-2xl font-black uppercase text-foreground">
                        {opsStatus.queue.user_counts.pending} pending / {opsStatus.queue.user_counts.running} running
                      </p>
                      <p className="mt-1 text-sm text-foreground/65">
                        Founder-specific tasks waiting or executing
                      </p>
                    </div>
                    <div className="rounded-[1.2rem] border border-border/70 px-4 py-4 shadow-lg bg-background">
                      <p className="mono-label text-foreground/50">Worker lanes</p>
                      <p className="mt-2 text-2xl font-black uppercase text-foreground">
                        {Object.entries(opsStatus.workers.by_pillar)
                          .map(([pillar, count]) => `${pillar.toLowerCase()}:${count}`)
                          .join(" / ") || "idle"}
                      </p>
                      <p className="mt-1 text-sm text-foreground/65">
                        Active agent runs by pillar
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="mono-label text-foreground/50">Current ingestion</p>
                        <h3 className="mt-2 text-2xl font-black uppercase tracking-tight text-foreground">
                          In-flight founder events
                        </h3>
                      </div>
                      <Badge variant="outline">
                        {opsStatus.active_ingestions.length} visible
                      </Badge>
                    </div>

                    {opsStatus.active_ingestions.length === 0 ? (
                      <div className="border-2 border-border px-4 py-8 shadow-pixel bg-background text-center text-sm text-foreground/60">
                        No user ingestion tasks are pending or running right now.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {opsStatus.active_ingestions.map((task) => (
                          <div
                            key={task.id}
                            className="status-breathe rounded-[1.2rem] border border-border/70 px-4 py-4 shadow-lg bg-background"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-foreground">
                                  <Activity className="h-4 w-4 text-primary" />
                                  {task.source || "UNKNOWN"} · {task.status}
                                </p>
                                <p className="text-sm text-foreground/60">
                                  {task.topic || task.trace_id || "Untitled ingestion"}
                                </p>
                              </div>
                              <p className="mono-label text-foreground/50">
                                {new Date(task.updated_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            <p className="mt-3 text-sm leading-7 text-foreground/75">
                              {task.preview || "No preview available."}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="border-2 border-border px-4 py-12 shadow-pixel bg-background text-center text-sm text-foreground/60">
                  Runtime status unavailable.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="panel-pro">
            <CardHeader>
              <Badge variant="outline">Queue Mix</Badge>
              <CardTitle className="font-sans text-2xl font-black uppercase tracking-tight">
                Task composition
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {opsStatus && Object.keys(opsStatus.queue.by_task_name).length > 0 ? (
                Object.entries(opsStatus.queue.by_task_name)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([taskName, count]) => (
                    <div
                      key={taskName}
                      className="flex items-center justify-between rounded-[1rem] border border-border/70 px-4 py-3 shadow-lg bg-background"
                    >
                      <div>
                        <p className="font-black uppercase tracking-tight text-foreground">
                          {taskName}
                        </p>
                      </div>
                      <Badge>{count}</Badge>
                    </div>
                  ))
              ) : (
                <div className="border-2 border-border px-4 py-8 shadow-pixel bg-background text-center text-sm text-foreground/60">
                  No queue data yet.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {demoMode && isAuthenticated ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_420px]">
          <Card className="panel-pro overflow-hidden">
            <CardHeader className="border-b-2 border-border">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Badge>Live Logs</Badge>
                  <CardTitle className="mt-2 font-sans text-3xl font-black uppercase tracking-[-0.05em]">
                    Pipeline terminal
                  </CardTitle>
                  <CardDescription className="text-base">
                    Streaming demo pipeline logs from the admin websocket for the active demo user.
                  </CardDescription>
                </div>
                <Badge variant={socketState === "open" ? "default" : "secondary"}>
                  {socketState}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div
                ref={logsViewportRef}
                className="max-h-[460px] overflow-y-auto bg-foreground p-4 font-mono text-xs text-background"
              >
                {logs.length === 0 ? (
                  <div className="rounded-[1rem] border-2 border-dashed border-background/35 px-4 py-8 text-background/60">
                    Waiting for runtime logs. Trigger a demo scenario from the bottom-left demo control.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <div
                        key={log.log_id}
                        className="rounded-[1rem] border border-background/25 bg-background/10 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-background/55">
                          <span>{new Date(log.generated_at).toLocaleTimeString()}</span>
                          <span>{log.pillar}</span>
                          <span>{log.agent_name}</span>
                          {log.step ? <span>{log.step}</span> : null}
                        </div>
                        <p className="mt-2 leading-6 text-background">{log.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="panel-pro">
            <CardHeader>
              <Badge variant="outline">Demo Snapshot</Badge>
              <CardTitle className="font-sans text-2xl font-black uppercase tracking-tight">
                Current seeded state
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="border-2 border-border px-4 py-4 shadow-pixel bg-background">
                <p className="mono-label text-foreground/50">Archive items</p>
                <p className="mt-2 text-4xl font-black">{snapshot?.archive_count ?? 0}</p>
              </div>
              <div className="border-2 border-border px-4 py-4 shadow-pixel bg-background">
                <p className="mono-label text-foreground/50">Summaries</p>
                <p className="mt-2 text-4xl font-black">{snapshot?.summary_count ?? 0}</p>
              </div>
              <div className="border-2 border-border px-4 py-4 shadow-pixel bg-background">
                <p className="mono-label text-foreground/50">Log stream</p>
                <p className="mt-2 text-4xl font-black">{logs.length}</p>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="mono-label text-foreground/50">Live feed</p>
              <h2 className="mt-2 flex items-center gap-3 text-4xl font-black uppercase tracking-[-0.06em] text-foreground">
                <Waves className="h-7 w-7 text-primary" />
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
              {visiblePromises.length === 0 ? (
                <p className="text-sm leading-7 text-foreground/60">No open promises detected yet.</p>
              ) : (
                visiblePromises.map((item) => (
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
              {visibleDrafts.length === 0 ? (
                <p className="text-sm leading-7 text-foreground/60">No suggested replies are waiting for review.</p>
              ) : (
                visibleDrafts.map((item) => (
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
