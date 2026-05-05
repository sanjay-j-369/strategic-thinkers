"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, ChevronDown, MessageSquare, Play, Radar, Settings, UserPlus, Users } from "lucide-react";

import { MentorChat } from "@/components/MentorChat";
import { WorkerConfigDrawer, type WorkerItem } from "@/components/WorkerConfigDrawer";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";

const WORKER_ICONS: Record<string, React.ElementType> = {
  "gtm-agent": Users,
  "hiring-agent": UserPlus,
  "finance-agent": Radar,
  "product-agent": MessageSquare,
  "compliance-agent": Settings,
};

const WORKER_SYSTEM_PROMPTS: Record<string, string> = {
  "gtm-agent": `You are a GTM (Go-To-Market) advisor for founders.
Stay strictly focused on:
- Sales pipeline health, revenue opportunities, renewals, expansion, and churn risk
- Customer-facing escalations, customer commitments, and revenue-impacting incidents
- GTM positioning and market timing only when it affects pipeline or customers

Do not include hiring, recruiting, candidate evaluation, engineering-only incident detail, or general company operations unless the context explicitly ties it to customer or revenue impact.
Do not list internal context providers from startup-profile, company-context, mentor, or leadership seed messages as stakeholders or owners. Use the business signal from those messages, not the sender names.
When generating a report, use GTM sections only: Revenue/Customer Signals, Risks, Recommended Founder Actions, Owners/Dates.`,
  "hiring-agent": `You are a hiring advisor for startup founders.
Focus on:
- Recruiting pipeline efficiency and candidate quality
- Interview process optimization
- Offer strategy and negotiation
- Team composition and cultural fit

Help founders make better hiring decisions faster. Analyze candidate information when provided and prepare relevant interview questions.`,
  "finance-agent": `You are a finance advisor for early-stage startup founders.
Focus on:
- Burn rate management and runway planning
- Unit economics and margin optimization
- Investor financial expectations
- Cash flow and invoice management

Translate financial complexity into clear founder decisions.`,
  "product-agent": `You are a product advisor for startup founders.
Focus on:
- User feedback synthesis and prioritization
- Feature request analysis and roadmap planning
- Competitive product analysis
- User engagement and retention signals

Help founders build products users actually want.`,
  "compliance-agent": `You are a compliance advisor for startup founders.
Focus on:
- Contract review and renewal timelines
- NDA management and legal obligations
- Regulatory requirement tracking
- Risk mitigation strategies

Keep founders out of legal trouble while enabling velocity.`,
};

const WORKER_CONTEXT_TAGS: Record<string, string[]> = {
  "gtm-agent": ["gtm", "customer", "revenue", "sales", "pipeline", "churn", "renewal", "expansion", "billing"],
  "hiring-agent": ["recruiting", "hr", "hiring", "candidates", "interviews"],
  "finance-agent": ["finance", "burn-rate", "runway", "budget", "metrics"],
  "product-agent": ["product", "feedback", "users", "features", "roadmap"],
  "compliance-agent": ["legal", "compliance", "contracts", "nda", "regulatory"],
};

interface AgentRunItem {
  id: string;
  pillar: string;
  agent_name: string;
  trigger_type: string;
  status: string;
  input_payload?: Record<string, unknown>;
  output_payload?: {
    blocker_summary?: string;
    notification?: {
      title?: string;
      body?: string;
    };
    notifications?: Array<{
      title?: string;
      body?: string;
    }>;
    metrics?: Record<string, unknown>;
  };
  error_text?: string | null;
  started_at: string;
  completed_at?: string | null;
}

export function WorkerDirectory() {
  const { token, isAuthenticated, loading, user } = useAuth();
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeWorker, setActiveWorker] = useState<WorkerItem | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("marketplace");
  const [selectedWorkerForChat, setSelectedWorkerForChat] = useState<string | null>(null);
  const [progressRuns, setProgressRuns] = useState<AgentRunItem[]>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [expandedRunIds, setExpandedRunIds] = useState<string[]>([]);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    let active = true;

    async function loadWorkers() {
      try {
        const data = await apiFetch<{ items: WorkerItem[] }>("/api/workers", { token });
        if (!active) return;
        setWorkers(data.items || []);
        setError(null);
      } catch (fetchError) {
        if (!active) return;
        setWorkers([]);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load workers.");
      }
    }

    void loadWorkers();
    return () => {
      active = false;
    };
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    let active = true;

    async function loadProgress() {
      try {
        const [workerRuns, mentorRuns] = await Promise.all([
          apiFetch<{ items: AgentRunItem[] }>("/api/ops/runs?pillar=WORKER&limit=8", { token }),
          apiFetch<{ items: AgentRunItem[] }>("/api/ops/runs?pillar=MENTOR&limit=4", { token }),
        ]);
        if (!active) return;
        setProgressRuns(
          [...(workerRuns.items || []), ...(mentorRuns.items || [])]
            .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
            .slice(0, 8)
        );
      } catch {
        if (active) setProgressRuns([]);
      }
    }

    void loadProgress();
    const interval = window.setInterval(loadProgress, 4000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [isAuthenticated, token]);

  const hiredWorkers = useMemo(
    () => workers.filter((worker) => worker.status === "hired"),
    [workers]
  );

  async function hireWorker(workerKey: string) {
    if (!token) return;
    setPendingKey(workerKey);
    try {
      const worker = await apiFetch<WorkerItem>(`/api/workers/${workerKey}/hire`, {
        method: "POST",
        token,
      });
      setWorkers((current) =>
        current.map((item) => (item.worker_key === workerKey ? worker : item))
      );
      setActiveWorker(worker);
      setNotice(`${worker.name} hired. It will run on background sweeps and can be run manually.`);
      setError(null);
    } catch (hireError) {
      setError(hireError instanceof Error ? hireError.message : "Failed to hire worker.");
    } finally {
      setPendingKey(null);
    }
  }

  async function saveConfig(workerKey: string, config: WorkerItem["config"]) {
    if (!token) return;
    setPendingKey(workerKey);
    try {
      const updated = await apiFetch<WorkerItem>(`/api/workers/${workerKey}/config`, {
        method: "PUT",
        token,
        json: { config },
      });
      setWorkers((current) =>
        current.map((item) => (item.worker_key === workerKey ? updated : item))
      );
      setActiveWorker(updated);
      setNotice(`${updated.name} focus updated.`);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save worker configuration.");
      throw saveError;
    } finally {
      setPendingKey(null);
    }
  }

  async function runWorker(workerKey: string) {
    if (!token) return;
    setPendingKey(workerKey);
    try {
      const response = await apiFetch<{ message?: string }>(`/api/workers/${workerKey}/run`, {
        method: "POST",
        token,
      });
      setNotice(response.message || "Worker run queued.");
      setActiveTab("active");
      setError(null);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failed to queue worker run.");
    } finally {
      setPendingKey(null);
    }
  }

  function progressSummary(run: AgentRunItem) {
    if (run.error_text) return run.error_text;
    if (run.output_payload?.notification?.body) return run.output_payload.notification.body;
    if (run.output_payload?.blocker_summary) return run.output_payload.blocker_summary;
    const firstNotification = run.output_payload?.notifications?.[0];
    if (firstNotification?.body) return firstNotification.body;
    if (run.status === "RUNNING") return "Working through context retrieval, analysis, and founder-facing output.";
    return "Queued or waiting for the next worker step.";
  }

  function toggleRunExpanded(runId: string) {
    setExpandedRunIds((current) =>
      current.includes(runId)
        ? current.filter((id) => id !== runId)
        : [...current, runId]
    );
  }

  function handleWorkerAction(worker: WorkerItem, action: "configure" | "chat") {
    if (action === "chat") {
      setSelectedWorkerForChat(worker.worker_key);
      setActiveTab("active");
    } else {
      // Open config drawer directly — don't switch tabs
      setActiveWorker(worker);
    }
  }

  if (loading) {
    return (
      <Card className="border border-border bg-card">
        <CardContent className="py-20 text-center text-sm text-foreground/60">
          Loading worker directory...
        </CardContent>
      </Card>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="border border-border bg-card">
        <CardContent className="space-y-4 py-16 text-center">
          <Badge variant="outline">Workers</Badge>
          <h1 className="text-4xl font-black uppercase tracking-[-0.05em] text-foreground">
            Sign in to hire workers.
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-foreground/65">
            The worker marketplace is account-specific. Authenticate to provision and configure background operators.
          </p>
          <div>
            <Button asChild>
              <Link href="/sign-in">Sign In</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chatWorker = selectedWorkerForChat ? workers.find((w) => w.worker_key === selectedWorkerForChat) : null;

  return (
    <>
      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div className="space-y-3">
            <Badge variant="outline">Workers</Badge>
            <h1 className="text-5xl font-black uppercase tracking-[-0.05em] text-foreground">
              Hire AI Workers.
            </h1>
            <p className="max-w-2xl text-base text-foreground/65">
              Pre-built agents that monitor your communications and prepare drafts for your review.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="border border-border bg-card px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">Active</p>
              <p className="mt-2 text-3xl font-black text-foreground">{hiredWorkers.length}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {notice && !error ? (
          <div className="border border-border bg-card px-4 py-3 text-sm text-foreground/70">
            {notice}
          </div>
        ) : null}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)}>
          <TabsList>
            <TabsTrigger value="marketplace">
              <Radar className="h-4 w-4 mr-2" />
              Marketplace
            </TabsTrigger>
            <TabsTrigger value="active">
              <Settings className="h-4 w-4 mr-2" />
              Active Workers ({hiredWorkers.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="marketplace" className="mt-6">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {workers.map((worker) => {
                const hired = worker.status === "hired";
                const busy = pendingKey === worker.worker_key;
                const Icon = WORKER_ICONS[worker.worker_key] || Users;

                return (
                  <Card key={worker.worker_key} className="border border-border bg-card overflow-hidden">
                    <CardHeader className="pb-4">
                      <div className="flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-primary/10">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        {hired ? (
                          <Badge className="bg-primary text-primary-foreground">Active</Badge>
                        ) : (
                          <Badge variant="outline">Available</Badge>
                        )}
                      </div>
                      <CardTitle className="mt-4 text-xl font-black uppercase tracking-tight text-foreground">
                        {worker.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm leading-relaxed text-foreground/70">{worker.description}</p>

                      {hired && (
                        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/50">
                            Monitor targets
                          </p>
                          <p className="text-sm font-medium text-foreground">
                            {worker.config?.monitor_targets || "Not configured"}
                          </p>
                        </div>
                      )}

                      <div className="flex flex-col gap-2 pt-2">
                        {hired ? (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleWorkerAction(worker, "configure")}
                              >
                                <Settings className="h-4 w-4 mr-1" />
                                Configure
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleWorkerAction(worker, "chat")}
                              >
                                <MessageSquare className="h-4 w-4 mr-1" />
                                Chat
                              </Button>
                            </div>
                          </>
                        ) : (
                          <Button
                            onClick={() => void hireWorker(worker.worker_key)}
                            disabled={busy}
                            className="w-full"
                          >
                            <UserPlus className="h-4 w-4 mr-1" />
                            {busy ? "Hiring..." : "Hire Worker"}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="active" className="mt-6">
            {hiredWorkers.length === 0 ? (
              <Card className="border border-border bg-card">
                <CardContent className="space-y-4 py-16 text-center">
                  <Users className="mx-auto h-12 w-12 text-foreground/30" />
                  <h3 className="text-2xl font-black uppercase text-foreground">No active workers</h3>
                  <p className="text-sm text-foreground/60">
                    Hire workers from the marketplace to start monitoring your communications.
                  </p>
                  <Button onClick={() => setActiveTab("marketplace")}>
                    <Radar className="h-4 w-4 mr-2" />
                    Browse Marketplace
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {hiredWorkers.map((worker) => {
                    const Icon = WORKER_ICONS[worker.worker_key] || Users;
                    const isSelected = selectedWorkerForChat === worker.worker_key;
                    const isConfiguring = activeWorker?.worker_key === worker.worker_key;

                    return (
                      <Card
                        key={worker.worker_key}
                        className={`cursor-pointer border-2 transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : isConfiguring
                              ? "border-border bg-card"
                              : "border-border bg-card hover:border-primary/50"
                        }`}
                        onClick={() => setSelectedWorkerForChat(worker.worker_key)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-primary/10">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            {isSelected && <Badge variant="secondary">Selected</Badge>}
                          </div>
                          <CardTitle className="mt-3 text-lg font-bold text-foreground">
                            {worker.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-xs text-foreground/60 line-clamp-2">
                            {worker.config?.monitor_targets || "No targets configured"}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              disabled={pendingKey === worker.worker_key}
                              onClick={(e) => {
                                e.stopPropagation();
                                void runWorker(worker.worker_key);
                              }}
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Run
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveWorker(worker);
                              }}
                            >
                              <Settings className="h-3 w-3 mr-1" />
                              Config
                            </Button>
                            <Button
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              className="flex-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleWorkerAction(worker, "chat");
                              }}
                            >
                              <MessageSquare className="h-3 w-3 mr-1" />
                              Chat
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <div className="border border-border bg-card">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
                    onClick={() => setProgressOpen((current) => !current)}
                    aria-expanded={progressOpen}
                  >
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-foreground/50">
                        Worker and Mentor Progress
                      </p>
                      <p className="mt-1 text-xs text-foreground/50">
                        Safe execution status and output previews from background runs.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-none">{progressRuns.length}</Badge>
                      <ChevronDown
                        className={`h-4 w-4 text-foreground/50 transition-transform ${
                          progressOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {progressOpen ? (
                    <div className="border-t border-border px-4 py-4">
                      {progressRuns.length === 0 ? (
                        <p className="text-sm text-foreground/50">
                          No recent worker or mentor runs yet. Click Run on an active worker to queue one.
                        </p>
                      ) : (
                        <div className="grid gap-3">
                          {progressRuns.map((run) => {
                            const expanded = expandedRunIds.includes(run.id);
                            return (
                              <div key={run.id} className="border border-border bg-background px-3 py-3">
                                <button
                                  type="button"
                                  className="flex w-full items-start justify-between gap-3 text-left"
                                  onClick={() => toggleRunExpanded(run.id)}
                                  aria-expanded={expanded}
                                >
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">
                                      {run.agent_name}
                                    </p>
                                    <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-foreground/40">
                                      {run.pillar} / {run.trigger_type} / {new Date(run.started_at).toLocaleTimeString()}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={run.status === "FAILED" ? "amber" : "outline"} className="rounded-none">
                                      {run.status}
                                    </Badge>
                                    <ChevronDown
                                      className={`h-4 w-4 text-foreground/50 transition-transform ${
                                        expanded ? "rotate-180" : ""
                                      }`}
                                    />
                                  </div>
                                </button>
                                <p
                                  className={`mt-3 whitespace-pre-line text-sm leading-6 text-foreground/65 ${
                                    expanded ? "" : "line-clamp-3"
                                  }`}
                                >
                                  {progressSummary(run)}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {chatWorker && (
                  <div className="border border-border rounded-lg bg-card overflow-hidden">
                    <div className="border-b border-border bg-muted/30 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-primary/10">
                          {(() => {
                            const Icon = WORKER_ICONS[chatWorker.worker_key] || Bot;
                            return <Icon className="h-4 w-4 text-primary" />;
                          })()}
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{chatWorker.name}</p>
                          <p className="text-xs text-foreground/50">Live chat with your AI worker</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedWorkerForChat(null)}
                      >
                        Close
                      </Button>
                    </div>
                    <div className="h-[500px]">
                      <MentorChat
                        key={chatWorker.worker_key}
                        token={token || ""}
                        title={chatWorker.name}
                        subtitle={`Chat with your ${chatWorker.name.toLowerCase()}`}
                        placeholder={`Ask about ${chatWorker.name.toLowerCase()} topics...`}
                        systemPrompt={WORKER_SYSTEM_PROMPTS[chatWorker.worker_key]}
                        workerKey={chatWorker.worker_key}
                        contextTags={WORKER_CONTEXT_TAGS[chatWorker.worker_key] || []}
                        storageKey={`worker-chat:${user?.id || "workspace"}:${chatWorker.worker_key}`}
                        quickPrompts={[
                          "Give me the latest update",
                          "Generate a report I can download",
                        ]}
                        compact
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between border-t border-border pt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/50">
            Workers operate asynchronously with founder review.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-foreground hover:text-primary"
          >
            Open control room
          </Link>
        </div>
      </section>

      <WorkerConfigDrawer
        open={Boolean(activeWorker)}
        worker={activeWorker}
        saving={pendingKey === activeWorker?.worker_key}
        onOpenChange={(open) => {
          if (!open) setActiveWorker(null);
        }}
        onSave={saveConfig}
      />
    </>
  );
}
