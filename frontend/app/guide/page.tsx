"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, MessageSquare, Send, Sparkles, TimerReset } from "lucide-react";

import { MentorChat } from "@/components/MentorChat";
import { SignalCard, type SignalItem } from "@/components/SignalCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";
import { useFounderFeed } from "@/lib/websocket";

const STARTERS = [
  "Should I hire a customer success lead this quarter?",
  "Runway dropped. What should I cut first without stalling growth?",
  "Are we operating like a seed company or pretending to be Series A already?",
  "What is the highest-leverage founder bottleneck visible in the last week?",
];

export default function GuidePage() {
  const { ready, token, user } = useRequireAuth();
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("async");
  const [runs, setRuns] = useState<any[]>([]);
  const signals = useFounderFeed(user?.id ?? "", token);

  const mentorSignals = useMemo(
    () =>
      signals.filter(
        (item) =>
          item.pillar === "MENTOR" ||
          item.notification_type === "GUIDE_QUERY" ||
          item.notification_type === "GUIDE_MILESTONE" ||
          item.notification_type === "RUNWAY_ALERT" ||
          item.notification_type === "HIRING_TRIGGER" ||
          item.notification_type === "BURNOUT_ALERT"
      ),
    [signals]
  );

  useEffect(() => {
    if (!ready || !token) return;
    let mounted = true;
    async function loadRuns() {
      try {
        const data = await apiFetch<{ items: any[] }>("/api/ops/runs?pillar=MENTOR&limit=8", { token });
        if (mounted) setRuns(data.items || []);
      } catch {
        if (mounted) setRuns([]);
      }
    }
    void loadRuns();
    const timer = setInterval(() => void loadRuns(), 8000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [ready, token]);

  async function submit(nextQuestion?: string) {
    const prompt = (nextQuestion || question).trim();
    if (!prompt || !token || submitting) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const data = await apiFetch<{ task_id: string; trace_id: string }>("/api/guide", {
        method: "POST",
        token,
        json: { question: prompt },
      });
      setStatus(`Queued mentor analysis. Task ${data.task_id.slice(0, 8)} is running in the background.`);
      setQuestion("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to queue mentor analysis.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <Card className="border border-border bg-card ">
        <CardContent className="py-20 text-center text-sm text-foreground/60">Loading mentor workspace...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="border border-border bg-card  bg-card text-card-foreground">
          <CardHeader>
            <Badge>Mentor</Badge>
            <CardTitle className="font-sans text-4xl font-black uppercase tracking-[-0.05em]">
              Board-grade prompts.
            </CardTitle>
            <CardDescription className="text-base text-card-foreground/70">
              This page now queues async mentor work to the backend. Ask the question, let the background system reason on it, and wait for the signal to land.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                className=" w-full border border-border bg-primary px-4 py-4 text-left text-sm font-black uppercase tracking-[0.06em] text-primary-foreground"
                onClick={() => void submit(starter)}
                disabled={submitting}
              >
                {starter}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border border-border bg-card  bg-card">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="w-full">
            <CardHeader className="pb-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <Badge variant="outline">Mentor</Badge>
                  <CardTitle className="font-sans text-4xl font-black uppercase tracking-[-0.05em]">Ask the mentor</CardTitle>
                </div>
                <TabsList className="grid w-auto grid-cols-2">
                  <TabsTrigger value="async">
                    <TimerReset className="h-4 w-4 mr-1" />
                    Async
                  </TabsTrigger>
                  <TabsTrigger value="chat">
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Live Chat
                  </TabsTrigger>
                </TabsList>
              </div>
              <CardDescription className="max-w-3xl text-base leading-7 text-foreground/70 pt-2">
                Async pushes to background queue. Live chat gets instant responses.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 pt-6">
              <TabsContent value="async" className="space-y-4 mt-0">
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="What strategic issue should the board member analyze next?"
                  className="min-h-[170px]"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="lg" onClick={() => void submit()} disabled={submitting || !question.trim()}>
                    <Send className="h-4 w-4" />
                    {submitting ? "Queueing..." : "Queue Analysis"}
                  </Button>
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-foreground/55">
                    <TimerReset className="h-4 w-4" />
                    Delivered through notifications
                  </div>
                </div>
                {status ? (
                  <div className="border border-border px-4 py-4  bg-background">
                    <p className="text-sm leading-7 text-foreground/75">{status}</p>
                  </div>
                ) : null}
              </TabsContent>
              <TabsContent value="chat" className="mt-0">
                <MentorChat
                  token={token || ""}
                  title="Board Member"
                  subtitle="Ask anything about your startup strategy"
                  placeholder="What's our biggest growth opportunity right now?"
                  storageKey={`mentor-chat:${user?.id || "workspace"}`}
                  quickPrompts={["Give me the latest update", "Generate a board-ready report"]}
                />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_360px]">
        <div className="space-y-4">
          <div>
            <p className="mono-label text-foreground/50">Latest mentor output</p>
            <h2 className="mt-2 text-4xl font-black uppercase tracking-[-0.06em] text-foreground">Strategic feed</h2>
          </div>
          {mentorSignals.length === 0 ? (
            <Card className="border border-border bg-card ">
              <CardContent className="space-y-4 py-16 text-center">
                <Sparkles className="mx-auto h-10 w-10 text-foreground" />
                <h3 className="text-2xl font-black uppercase text-foreground">Nothing returned yet</h3>
                <p className="text-sm leading-7 text-foreground/65">
                  Queue a mentor question or wait for the weekly strategic sweep to push a note.
                </p>
              </CardContent>
            </Card>
          ) : (
            mentorSignals.slice(0, 8).map((signal, index) => (
              <motion.div
                key={signal.id || `${signal.notification_type}-${signal.created_at}-${index}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, delay: index * 0.03 }}
              >
                <SignalCard signal={signal as SignalItem} />
              </motion.div>
            ))
          )}
        </div>

        <Card className="border border-border bg-card  bg-card">
          <CardHeader>
            <Badge variant="outline">Run log</Badge>
            <CardTitle className="font-sans text-2xl font-black uppercase tracking-tight">
              Recent mentor executions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {runs.length === 0 ? (
              <p className="text-sm leading-7 text-foreground/60">No mentor runs logged yet.</p>
            ) : (
              runs.map((run) => (
                <div key={run.id} className="border border-border px-4 py-4  bg-background">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black uppercase tracking-[0.08em] text-foreground">{run.agent_name}</p>
                    <Badge variant="outline">{run.status}</Badge>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-foreground/45">
                    {new Date(run.started_at).toLocaleString()}
                  </p>
                  {run.error_text ? (
                    <p className="mt-3 inline-flex items-center gap-2 border border-border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                      <AlertTriangle className="h-4 w-4" />
                      {run.error_text}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
