"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlarmClock,
  ArrowRight,
  Bell,
  ChevronDown,
  ChevronUp,
  Inbox,
  Layers3,
  Lock,
  Server,
} from "lucide-react";

import { DraftReviewer } from "@/components/DraftReviewer";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

interface ActionItem {
  id: string;
  entityId: string;
  kind: "signal" | "promise" | "draft";
  label: string;
  title: string;
  summary: string;
  detail: string;
  source: string;
  href: string;
  created_at?: string;
  count?: number;
  unread?: boolean;
}

function compactText(value?: string, maxLength = 240) {
  const text = (value || "")
    .replace(/\*\*/g, "")
    .replace(/Vault mode is active\.[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function markdownDetail(value?: string) {
  return (value || "")
    .replace(/Vault mode is active\.[\s\S]*$/i, "")
    .replace(/:\s+\*\s+/g, ":\n\n* ")
    .replace(/\s+\*\s+/g, "\n* ")
    .replace(/\s+(\d+\.\s+)/g, "\n$1")
    .trim();
}

function commitmentParts(text?: string) {
  const raw = (text || "").trim();
  const flattened = raw.replace(/\s+/g, " ");
  const match = flattened.match(/^Subject:\s*(.*?)\s+From:\s*([^>]+>)(.*)$/i);
  if (!match) {
    return {
      title: promiseTitle(raw),
      detail: markdownDetail(raw),
      summary: compactText(raw),
    };
  }

  const [, subject, from, body] = match;
  const detail = [`**From:** ${from.trim()}`, "", markdownDetail(body.trim())]
    .filter(Boolean)
    .join("\n");

  return {
    title: subject.trim(),
    detail,
    summary: compactText(body.trim() || raw),
  };
}

function normalizeActionKey(value?: string) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function signalTypeLabel(type?: string) {
  if (type === "GTM_SKELETON_DRAFT" || type === "WORKER_FOLLOW_UP") return "Worker follow-up";
  if (type === "INGESTION_WATCH_UPDATE") return "Context update";
  if (type === "GUIDE_QUERY") return "Mentor note";
  return (type || "Signal").replace(/_/g, " ").toLowerCase();
}

function signalTitle(title?: string) {
  return (title || "Untitled signal").replace("surfaced GTM actions", "surfaced actions");
}

function promiseTitle(text?: string) {
  const cleaned = compactText(text, 180);
  const subject = cleaned.match(/Subject:\s*([^<\n]+?)(?:\s+From:|$)/i)?.[1]?.trim();
  if (subject) return subject;

  const firstSentence = cleaned.split(/[.!?]\s+/)[0]?.trim();
  return compactText(firstSentence || cleaned || "Open promise", 100);
}

function actionTimestamp(value?: string) {
  if (!value) return "Just now";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  const [opsStatus, setOpsStatus] = useState<OpsStatus | null>(null);
  const [piiMap, setPiiMap] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<AdminLogEvent[]>([]);
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">("closed");
  const [systemTrayOpen, setSystemTrayOpen] = useState(false);
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [completedActionIds, setCompletedActionIds] = useState<Set<string>>(new Set());
  const [expandedPromiseId, setExpandedPromiseId] = useState<string | null>(null);
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

  const visibleSignals = useMemo(
    () =>
      signals.map((signal) => ({
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
  const uniqueVisiblePromises = useMemo(() => {
    const seen = new Set<string>();
    return visiblePromises.filter((item) => {
      const key = normalizeActionKey(item.promise_text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [visiblePromises]);
  const visibleDrafts = useMemo(
    () =>
      drafts.map((item) => ({
        ...item,
        prompt: replacePIITokens(item.prompt, piiMap),
        draft_text: replacePIITokens(item.draft_text, piiMap),
      })),
    [drafts, piiMap]
  );
  const groupedSignalActions = useMemo(() => {
    const groups = new Map<string, ActionItem>();
    visibleSignals.forEach((signal) => {
      const key = [
        signal.pillar || "SYSTEM",
        signal.agent_name || "Founder OS",
        signal.notification_type || signal.type || "SIGNAL",
        signalTitle(signal.title),
      ].map(normalizeActionKey).join(":");
      const createdAt = signal.created_at || signal.generated_at;
      const existing = groups.get(key);
      const next: ActionItem = {
        id: `signal-${key || signal.id || createdAt}`,
        entityId: signal.id || "",
        kind: "signal",
        label: signalTypeLabel(signal.notification_type || signal.type),
        title: signalTitle(signal.title),
        summary: compactText(signal.body),
        detail: markdownDetail(signal.body),
        source: signal.agent_name || "Founder OS",
        href: "#signals",
        created_at: createdAt,
        count: (existing?.count || 0) + 1,
        unread: !signal.read_at || Boolean(existing?.unread),
      };
      if (
        !existing ||
        new Date(createdAt || 0).getTime() > new Date(existing.created_at || 0).getTime()
      ) {
        groups.set(key, next);
      } else {
        groups.set(key, { ...existing, count: next.count, unread: next.unread });
      }
    });

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }, [visibleSignals]);
  const actionItems = useMemo<ActionItem[]>(() => {
    const draftActions = visibleDrafts.slice(0, 2).map((draft) => ({
      id: `draft-${draft.id}`,
      entityId: draft.id,
      kind: "draft" as const,
      label: "Draft",
      title: draft.prompt || "Draft reply ready",
      summary: compactText(draft.draft_text),
      detail: markdownDetail(draft.draft_text),
      source: "Draft Inbox",
      href: "#drafts",
      created_at: draft.created_at,
      unread: true,
    }));
    const promiseActions = uniqueVisiblePromises.slice(0, 4).map((promise) => {
      const parts = commitmentParts(promise.promise_text);
      return {
        id: `promise-${promise.id}`,
        entityId: promise.id,
        kind: "promise" as const,
        label: "Promise",
        title: parts.title,
        summary: parts.summary,
        detail: parts.detail,
        source: "Open commitment",
        href: "#promises",
        created_at: promise.created_at,
        unread: false,
      };
    });

    return [...draftActions, ...promiseActions, ...groupedSignalActions.slice(0, 6)]
      .filter((action) => !completedActionIds.has(action.id))
      .slice(0, 10);
  }, [completedActionIds, groupedSignalActions, uniqueVisiblePromises, visibleDrafts]);
  const dashboardMetrics = opsStatus
    ? [
        { label: "Tasks in Progress", value: opsStatus.queue.counts.pending, accent: "bg-primary text-on-primary" },
        { label: "Running now", value: opsStatus.queue.counts.running, accent: "bg-surface-high text-on-surface" },
        { label: "Active workers", value: opsStatus.workers.active_runs, accent: "bg-surface-high text-on-surface" },
        { label: "Live Sync Status", value: opsStatus.websocket.user_connections, accent: "bg-primary text-on-primary" },
      ]
    : [];
  const connectedSourceCount = Number(Boolean(user?.google_connected)) + Number(Boolean(user?.slack_connected));
  const attentionCount = actionItems.length;

  async function markActionDone(action: ActionItem) {
    setCompletedActionIds((current) => new Set(current).add(action.id));
    setExpandedActionId(null);
    if (!token) return;

    try {
      if (action.kind === "signal" && action.entityId) {
        await apiFetch(`/api/ops/notifications/${action.entityId}/read`, {
          method: "POST",
          token,
        });
      }
      if (action.kind === "promise") {
        await apiFetch(`/api/ops/promises/${action.entityId}/complete`, {
          method: "POST",
          token,
        });
        setPromises((current) => current.filter((item) => item.id !== action.entityId));
      }
    } catch {
      setCompletedActionIds((current) => {
        const next = new Set(current);
        next.delete(action.id);
        return next;
      });
    }
  }

  async function markPromiseDone(promiseId: string) {
    setExpandedPromiseId(null);
    setPromises((current) => current.filter((item) => item.id !== promiseId));
    if (!token) return;

    try {
      await apiFetch(`/api/ops/promises/${promiseId}/complete`, {
        method: "POST",
        token,
      });
    } catch {
      void Promise.resolve();
    }
  }

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
            {attentionCount} action{attentionCount === 1 ? "" : "s"} need review. Worker updates are grouped so the home page stays focused.
          </p>
          <div className="flex flex-wrap gap-4 mt-6">
            {isAuthenticated ? (
              <>
                <Button asChild size="lg" className="bg-primary text-on-primary hover:bg-primary/90">
                  <Link href={visibleDrafts.length > 0 ? "#drafts" : "#signals"}>
                    {visibleDrafts.length > 0 ? "Review Drafts" : "Review Actions"}
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
              <span className="bento-stat-value">{uniqueVisiblePromises.length}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content - Cols 1-8 */}
      <div className="bento-main">
        <div className="bento-card" id="signals">
          <div className="bento-card-header">
            <div>
              <p className="bento-label">Action list</p>
              <h2 className="bento-title">
                <Bell className="h-5 w-5 text-primary" />
                What Needs Attention
              </h2>
            </div>
            <Badge variant="outline">{actionItems.length} open</Badge>
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
            ) : actionItems.length === 0 ? (
              <div className="bento-empty">
                <Bell className="h-8 w-8 text-on-surface-variant mx-auto" />
                <p className="text-sm text-on-surface-variant mt-2">No open actions</p>
                <p className="text-xs text-on-surface-variant/60 mt-1">New promises, drafts, and worker alerts will appear here.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[16px] border border-outline/20 divide-y divide-outline/20">
                {actionItems.map((action, index) => {
                  const Icon = action.kind === "draft" ? Inbox : action.kind === "promise" ? AlarmClock : Bell;
                  const isExpanded = expandedActionId === action.id;
                  return (
                    <motion.div
                      key={action.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.03 }}
                    >
                      <button
                        className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)_1.25rem] items-start gap-4 bg-transparent px-4 py-4 text-left transition-colors hover:bg-surface-high focus-visible:bg-surface-high focus-visible:outline-none"
                        onClick={() => setExpandedActionId(isExpanded ? null : action.id)}
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-surface-high text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium uppercase tracking-wider text-on-surface-variant">
                            <span className="whitespace-nowrap">{action.label}</span>
                            <span className="whitespace-nowrap">{action.source}</span>
                            <span className="whitespace-nowrap">{actionTimestamp(action.created_at)}</span>
                            {action.count && action.count > 1 ? (
                              <Badge variant="outline">{action.count} updates</Badge>
                            ) : null}
                            {action.unread ? <Badge variant="secondary">new</Badge> : null}
                          </span>
                          <span className="block text-sm font-semibold leading-6 text-on-surface">
                            {action.title}
                          </span>
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {isExpanded ? (
                        <div className="border-t border-outline/20 bg-surface-high px-4 py-4 text-sm leading-6 text-on-surface-variant sm:px-16">
                          <div className="prose prose-sm max-w-none text-left text-on-surface-variant dark:prose-invert [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1 [&_strong]:text-on-surface">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {action.detail || action.summary}
                            </ReactMarkdown>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button asChild size="sm" variant="outline" className="text-xs">
                              <Link href={action.href}>Open section</Link>
                            </Button>
                            {action.kind !== "draft" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="text-xs"
                                onClick={() => void markActionDone(action)}
                              >
                                Mark done
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {visibleDrafts.length > 0 ? (
          <div className="bento-card" id="drafts">
            <div className="bento-card-header">
              <div>
                <p className="bento-label">Pending review</p>
                <h2 className="bento-title">
                  <Inbox className="h-5 w-5 text-primary" />
                  Draft Replies
                </h2>
              </div>
              <Badge variant="outline">{visibleDrafts.length}</Badge>
            </div>
            <div className="bento-card-content">
              <DraftReviewer />
            </div>
          </div>
        ) : null}
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
                {uniqueVisiblePromises.slice(0, 4).map((item) => (
                  <div key={item.id} className="promise-item">
                    {(() => {
                      const parts = commitmentParts(item.promise_text);
                      return (
                        <>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 text-left"
                      onClick={() => setExpandedPromiseId(expandedPromiseId === item.id ? null : item.id)}
                    >
                      <span className="text-sm font-semibold leading-6 text-on-surface">
                        {parts.title}
                      </span>
                      <ChevronDown
                        className={`mt-1 h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${
                          expandedPromiseId === item.id ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                    {expandedPromiseId === item.id ? (
                      <div className="mt-3 border-t border-outline/20 pt-3">
                        <div className="prose prose-sm max-w-none text-on-surface-variant dark:prose-invert [&_p]:my-2 [&_ol]:my-2 [&_li]:my-1 [&_strong]:text-on-surface">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {parts.detail}
                          </ReactMarkdown>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-3 text-xs"
                          onClick={() => void markPromiseDone(item.id)}
                        >
                          Mark done
                        </Button>
                      </div>
                    ) : null}
                        </>
                      );
                    })()}
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
