"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlarmClock,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Inbox,
  Layers3,
  Lock,
  Server,
  Sparkles,
  Waves,
} from "lucide-react";

import { SignalCard, type SignalItem } from "@/components/SignalCard";
import { DraftReviewer } from "@/components/DraftReviewer";
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

interface WorkerItem {
  id: string;
  worker_key: string;
  name: string;
  description: string;
  status: string;
  config: {
    monitor_targets?: string;
    auto_draft_replies?: boolean;
    custom_instructions?: string;
  };
  security_mode: "vault";
  live_status: string;
  updated_at?: string | null;
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
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [piiMap, setPiiMap] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<AdminLogEvent[]>([]);
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">("closed");
  const [systemTrayOpen, setSystemTrayOpen] = useState(false);
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const logsViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    let active = true;

    async function loadOps() {
      try {
        const [promiseData, draftData, statusData, workerData] = await Promise.all([
          apiFetch<{ items: PromiseItem[] }>("/api/ops/promises?limit=6", { token }),
          apiFetch<{ items: DraftItem[] }>("/api/ops/drafts?limit=4", { token }),
          apiFetch<OpsStatus>("/api/ops/system-status", { token }),
          apiFetch<{ items: WorkerItem[] }>("/api/workers", { token }),
        ]);
        if (!active) return;
        setPromises(promiseData.items || []);
        setDrafts(draftData.items || []);
        setOpsStatus(statusData);
        setWorkers((workerData.items || []).filter((worker) => worker.status === "hired"));
      } catch {
        if (!active) return;
        setPromises([]);
        setDrafts([]);
        setOpsStatus(null);
        setWorkers([]);
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
      { label: "Unread Signals", value: unread, icon: Bell, href: "#signals", detail: "Open feed" },
      { label: "Open Promises", value: promises.length, icon: AlarmClock, href: "#promises", detail: "Review promises" },
      { label: "Draft Replies", value: drafts.length, icon: Inbox, href: "#drafts", detail: "Review drafts" },
      { label: "Worker Alerts", value: workerAlerts, icon: BriefcaseBusiness, href: "#worker-runtime", detail: "Open workers" },
      { label: "Mentor Notes", value: mentorAlerts, icon: Sparkles, href: "#signals", detail: "Open mentor feed" },
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
  const dashboardMetrics = opsStatus
    ? [
        { label: "Tasks in Progress", value: opsStatus.queue.counts.pending, accent: "bg-primary text-on-primary" },
        { label: "Running now", value: opsStatus.queue.counts.running, accent: "bg-surface-high text-on-surface" },
        { label: "Active workers", value: opsStatus.workers.active_runs, accent: "bg-surface-high text-on-surface" },
        { label: "Live Sync Status", value: opsStatus.websocket.user_connections, accent: "bg-primary text-on-primary" },
      ]
    : [];
  const hiredWorkers = workers;
  const connectedSourceCount = Number(Boolean(user?.google_connected)) + Number(Boolean(user?.slack_connected));

  return (
    <div className="bento-full-grid gap-6 max-w-7xl mx-auto pt-24 pb-12">
      {/* Hero Section - Horizontal split layout */}
      <section className="bento-hero">
        <div className="bento-hero-left">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-xs font-medium uppercase tracking-widest text-on-surface-variant">System Active</span>
          </div>
          <h1 className="bento-hero-title">
            Overview
          </h1>
          <p className="bento-hero-description">
            {drafts.length + promises.length} tasks require your attention. Your workers are active and monitoring your sources.
          </p>
          <div className="flex flex-wrap gap-4 mt-6">
            {isAuthenticated ? (
              <>
                <Button asChild size="lg" className="bg-primary text-on-primary hover:bg-primary/90">
                  <Link href="#drafts">
                    Review Drafts
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-outline text-on-surface hover:bg-state-layer-hover">
                  <Link href="/ingest">Connect Sources</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg" className="bg-primary text-on-primary hover:bg-primary/90">
                  <Link href="/sign-up">Create Workspace</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="border-outline text-on-surface hover:bg-state-layer-hover">
                  <Link href="/sign-in">Sign In</Link>
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="bento-hero-right">
          <div className="flex flex-col gap-2 w-full">
            <div className="bento-stat-item">
              <span className="bento-stat-label">Sources</span>
              <span className="bento-stat-value">{connectedSourceCount}/2</span>
            </div>
            <div className="bento-stat-item">
              <span className="bento-stat-label">Drafts</span>
              <span className="bento-stat-value">{drafts.length}</span>
            </div>
            <div className="bento-stat-item">
              <span className="bento-stat-label">Promises</span>
              <span className="bento-stat-value">{promises.length}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pulse Tiles - 3 equal square tiles - Cols 1-8 */}
      <section className="bento-pulse-row" id="signals">
        {metrics.slice(0, 3).map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="bento-pulse-tile">
              <Icon className="h-8 w-8 text-primary bento-pulse-icon" />
              <p className="bento-pulse-label">{metric.label}</p>
              <p className="bento-pulse-value">{metric.value}</p>
            </div>
          );
        })}
      </section>

      {/* Main Content - Cols 1-8 */}
      <div className="bento-main">
        {/* Signals Card */}
        <div className="bento-card" id="signals">
          <div className="bento-card-header">
            <div>
              <p className="bento-label">Live feed</p>
              <h2 className="bento-title">
                <Waves className="h-5 w-5 text-primary" />
                Actionable Signals
              </h2>
            </div>
            <Badge variant="outline">{featured.length} visible</Badge>
          </div>
          <div className="bento-card-content">
            {loading ? (
              <div className="bento-empty">
                <p className="text-sm text-on-surface-variant">Loading operator surface...</p>
              </div>
            ) : !isAuthenticated ? (
              <div className="bento-empty">
                <Layers3 className="h-8 w-8 text-on-surface-variant mx-auto" />
                <p className="text-sm text-on-surface-variant mt-2">Sign in to see live signals</p>
              </div>
            ) : featured.length === 0 ? (
              <div className="bento-empty">
                <Bell className="h-8 w-8 text-on-surface-variant mx-auto" />
                <p className="text-sm text-on-surface-variant mt-2">Waiting for the first signal</p>
                <p className="text-xs text-on-surface-variant/60 mt-1">Connect sources to start receiving alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {featured.map((signal, index) => (
                  <motion.div
                    key={signal.id || `${signal.notification_type}-${signal.created_at}-${index}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                  >
                    <SignalCard signal={signal as SignalItem} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drafts Card */}
        <div className="bento-card" id="drafts">
          <div className="bento-card-header">
            <div>
              <p className="bento-label">Pending review</p>
              <h2 className="bento-title">
                <Inbox className="h-5 w-5 text-primary" />
                Draft Replies
              </h2>
            </div>
            <Badge variant="outline">{drafts.length}</Badge>
          </div>
          <div className="bento-card-content">
            <DraftReviewer />
          </div>
        </div>
      </div>

      {/* Sidebar - Cols 9-12 */}
      <div className="bento-sidebar-col">
        {/* Operator Card - Workspace + Identity */}
        <div className="bento-sidebar-card">
          <h2 className="bento-sidebar-title">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              {isAuthenticated ? "Ready" : "Locked"}
            </span>
          </h2>
          <div className="bento-operator-item">
            <p className="bento-operator-label">Current identity</p>
            <p className="bento-operator-value">{user?.full_name || user?.email || "anonymous"}</p>
          </div>
          <div className="bento-operator-item">
            <p className="bento-operator-label">Connected sources</p>
            <p className="bento-operator-value">
              {user?.google_connected ? "Google" : "Google off"} / {user?.slack_connected ? "Slack" : "Slack off"}
            </p>
          </div>
          <div className="bento-operator-item">
            <p className="bento-operator-label">Encrypted workspace</p>
            <p className="bento-operator-value">{privateKey ? "Unlocked" : "Locked"}</p>
            <p className="bento-operator-description">
              {privateKey ? "Client decryption available" : "Unlock from archive page"}
            </p>
          </div>
          <div className="bento-operator-item">
            <p className="bento-operator-label">Quick actions</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button asChild size="sm" variant="outline" className="text-xs">
                <Link href="/privacy">Open Archive</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="text-xs">
                <Link href="/workers">Workers</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Open Promises Card */}
        <div className="bento-sidebar-card" id="promises">
          <div className="bento-card-header">
            <div>
              <p className="bento-label">Commitments</p>
              <h2 className="bento-title">
                <AlarmClock className="h-5 w-5 text-primary" />
                Open Promises
              </h2>
            </div>
          </div>
          <div className="bento-card-content">
            {visiblePromises.length === 0 ? (
              <div className="bento-empty">
                <p className="text-sm text-on-surface-variant">No open promises detected</p>
              </div>
            ) : (
              <div className="space-y-2">
                {visiblePromises.slice(0, 5).map((item) => (
                  <div key={item.id} className="promise-item">
                    <p className="text-sm text-on-surface">{item.promise_text}</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* System Intelligence Tray - Full width at bottom */}
      {isAuthenticated && (
        <section className="system-tray col-span-full">
          <button
            className="system-tray-toggle"
            onClick={() => setSystemTrayOpen(!systemTrayOpen)}
          >
            <div className="flex items-center gap-3">
              <Server className="h-4 w-4 text-on-surface-variant" />
              <span className="text-sm font-medium text-on-surface-variant uppercase tracking-wider">
                System Intelligence
              </span>
              <Badge variant="outline" className="text-xs">
                {opsStatus?.runner.status || "Unknown"}
              </Badge>
            </div>
            {systemTrayOpen ? (
              <ChevronUp className="h-4 w-4 text-on-surface-variant" />
            ) : (
              <ChevronDown className="h-4 w-4 text-on-surface-variant" />
            )}
          </button>

          <AnimatePresence>
            {systemTrayOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="system-tray-content"
              >
                <div className="grid gap-4 md:grid-cols-3">
                  {/* System Status */}
                  <div className="system-card">
                    <h3 className="system-card-title">System Status</h3>
                    <div className="system-metrics-grid">
                      {dashboardMetrics.map((metric) => (
                        <div key={metric.label} className={`system-metric ${metric.accent}`}>
                          <p className="system-metric-label">{metric.label}</p>
                          <p className="system-metric-value">{metric.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="system-info-row">
                      <span className="flex items-center gap-2 text-xs text-on-surface-variant">
                        <span className="live-dot" />
                        {opsStatus?.runner.status || "loading"}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        Polls every {opsStatus?.runner.poll_interval_seconds}s
                      </span>
                    </div>
                  </div>

                  {/* Queue Mix */}
                  <div className="system-card">
                    <h3 className="system-card-title">Task Composition</h3>
                    {opsStatus && Object.keys(opsStatus.queue.by_task_name).length > 0 ? (
                      <div className="system-queue-list">
                        {Object.entries(opsStatus.queue.by_task_name)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 5)
                          .map(([taskName, count]) => (
                            <div key={taskName} className="system-queue-item">
                              <span className="text-xs text-on-surface">{taskName}</span>
                              <Badge variant="outline" className="text-xs">{count}</Badge>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-xs text-on-surface-variant">No queue data</p>
                    )}
                  </div>

                  {/* Live Logs (Demo only) */}
                  {demoMode && (
                    <div className="system-card">
                      <h3 className="system-card-title">
                        Pipeline Terminal
                        <Badge variant={socketState === "open" ? "default" : "secondary"} className="ml-2 text-xs">
                          {socketState}
                        </Badge>
                      </h3>
                      <div
                        ref={logsViewportRef}
                        className="system-logs-viewport"
                      >
                        {logs.length === 0 ? (
                          <p className="text-xs text-on-surface-variant">Waiting for logs...</p>
                        ) : (
                          logs.slice(0, 10).map((log) => (
                            <div key={log.log_id} className="system-log-entry">
                              <span className="text-[10px] text-on-surface-variant uppercase">
                                {log.pillar}
                              </span>
                              <p className="text-xs text-on-surface truncate">{log.message}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}