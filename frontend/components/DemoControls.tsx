"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Inbox,
  MessageSquare,
  RefreshCw,
  Rocket,
  Sparkles,
  TerminalSquare,
  X,
} from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function DemoControls({ inline = false }: { inline?: boolean }) {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<
    "bootstrap" | "email" | "slack" | "prep" | "growth" | "reset" | "scenario" | null
  >(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<
    Array<{ name: string; event_count: number; sources: string[] }>
  >([]);

  useEffect(() => {
    if (!DEMO_MODE) return;

    function onKeydown(event: KeyboardEvent) {
      if (event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  useEffect(() => {
    if (!DEMO_MODE || !token) return;
    let active = true;

    async function loadScenarios() {
      try {
        const data = await apiFetch<{
          items: Array<{ name: string; event_count: number; sources: string[] }>;
        }>("/api/demo/scenarios", { token });
        if (active) {
          setScenarios(data.items || []);
        }
      } catch {
        if (active) {
          setScenarios([]);
        }
      }
    }

    void loadScenarios();
    return () => {
      active = false;
    };
  }, [token]);

  async function runAction(
    action: "bootstrap" | "email" | "slack" | "prep" | "growth" | "reset",
    path: string,
    message: string,
    body?: unknown
  ) {
    if (!DEMO_MODE) return;
    setBusy(action);
    setError(null);
    setStatus(null);
    try {
      const response = await apiFetch<{ queued?: number }>(path, {
        method: "POST",
        token,
        json: body,
      });
      const queued = response.queued ?? 0;
      setStatus(`${message}${queued ? ` (${queued} event${queued > 1 ? "s" : ""})` : ""}`);
      if (action === "reset") {
        window.dispatchEvent(new Event("demo:reset-feed"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runScenario(name: string) {
    if (!DEMO_MODE || !token || !user?.id) return;
    setBusy("scenario");
    setError(null);
    setStatus(null);
    try {
      const response = await apiFetch<{ queued?: number; scenario_name?: string }>(
        "/api/demo/trigger-scenario",
        {
          method: "POST",
          token,
          json: {
            user_id: user.id,
            scenario_name: name,
          },
        }
      );
      setStatus(
        `Scenario ${response.scenario_name || name} queued${response.queued ? ` (${response.queued} event${response.queued > 1 ? "s" : ""})` : ""}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario trigger failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!DEMO_MODE) return null;

  return (
    <>
      {!inline && !open ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="fixed bottom-5 left-5 z-[60]"
          onClick={() => setOpen(true)}
        >
          <TerminalSquare className="h-4 w-4" />
          Demo
        </Button>
      ) : null}

      {(inline || open) ? (
        <div
          className={
            inline
              ? "w-full"
              : "fixed inset-y-0 right-0 z-[70] w-full max-w-sm border-l border-border bg-card p-4 shadow-2xl backdrop-blur-xl"
          }
        >
          <Card className={inline ? "border-border bg-card" : "h-full border-border bg-zinc-950/90"}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <Badge className="w-fit">{inline ? "Demo Actions" : "Presenter Overlay"}</Badge>
                  <CardTitle className="text-lg">Demo Command Center</CardTitle>
                </div>
                {!inline ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {scenarios.length > 0 ? (
                <div className="space-y-2 rounded-2xl border border-border/70 bg-background/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="mono-label">Scenario Run</p>
                    <Badge variant="outline">{scenarios.length}</Badge>
                  </div>
                  <div className="grid gap-2">
                    {scenarios.map((scenario) => (
                      <Button
                        key={scenario.name}
                        className="w-full justify-between"
                        disabled={busy !== null}
                        variant="outline"
                        onClick={() => void runScenario(scenario.name)}
                      >
                        <span className="flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          {scenario.name.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">
                          {scenario.event_count} evt
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <Button
                className="w-full justify-start"
                disabled={busy !== null}
                variant="secondary"
                onClick={() =>
                  runAction(
                    "bootstrap",
                    "/api/demo/bootstrap",
                    "Full demo timeline queued.",
                    { reset: true }
                  )
                }
              >
                <RefreshCw className="h-4 w-4" />
                Queue Full Timeline
              </Button>

              <Button
                className="w-full justify-start"
                disabled={busy !== null}
                onClick={() =>
                  runAction("email", "/api/demo/trigger-email", "Demo email queued.")
                }
              >
                <Inbox className="h-4 w-4" />
                Trigger Demo Email
              </Button>

              <Button
                className="w-full justify-start"
                disabled={busy !== null}
                variant="secondary"
                onClick={() =>
                  runAction("slack", "/api/demo/trigger-slack", "Demo Slack message queued.")
                }
              >
                <MessageSquare className="h-4 w-4" />
                Trigger Demo Slack
              </Button>

              <Button
                className="w-full justify-start"
                disabled={busy !== null}
                onClick={() =>
                  runAction(
                    "prep",
                    "/api/demo/trigger-prep",
                    "Meeting prep task queued."
                  )
                }
              >
                <Rocket className="h-4 w-4" />
                Trigger Meeting Prep
              </Button>

              <Button
                className="w-full justify-start"
                variant="default"
                disabled={busy !== null}
                onClick={() =>
                  runAction(
                    "growth",
                    "/api/demo/trigger-growth",
                    "Growth milestone evaluator queued."
                  )
                }
              >
                <Sparkles className="h-4 w-4" />
                Trigger Growth Milestone
              </Button>

              <Button
                className="w-full justify-start"
                variant="outline"
                disabled={busy !== null}
                onClick={() =>
                  runAction(
                    "reset",
                    "/api/demo/reset",
                    "Demo reset complete. Re-seeding pipeline."
                  )
                }
              >
                <RefreshCw className="h-4 w-4" />
                Reset Demo
              </Button>

              {status ? (
                <p className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {status}
                </p>
              ) : null}
              {error ? (
                <p className="rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                  {error}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
