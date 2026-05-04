"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Calendar,
  TerminalSquare,
  X,
} from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function DemoControls({ inline = false }: { inline?: boolean }) {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"scenario" | "meeting" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [scenarios, setScenarios] = useState<
    Array<{ name: string; event_count: number; sources: string[] }>
  >([]);

  useEffect(() => {
    if (user?.id) {
      setTargetUserId((current) => current || user.id);
    }
  }, [user?.id]);

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

  async function runScenario(name: string) {
    if (!DEMO_MODE || !token || !targetUserId.trim()) return;
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
            user_id: targetUserId.trim(),
            scenario_name: name,
          },
        }
      );
      setStatus(
        `Scenario ${response.scenario_name || name} queued for ${targetUserId.trim()}${response.queued ? ` (${response.queued} event${response.queued > 1 ? "s" : ""})` : ""}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario trigger failed.");
    } finally {
      setBusy(null);
    }
  }

  async function triggerMeetingPrep() {
    if (!DEMO_MODE || !token || !targetUserId.trim()) return;
    setBusy("meeting");
    setError(null);
    setStatus(null);
    try {
      await apiFetch("/api/meetings", {
        method: "POST",
        token,
        json: {
          user_id: targetUserId.trim(),
          topic: "Executive Briefing with Enterprise Customer",
          attendees: ["sarah.kim@investor.com", "marcus@client-co.com"],
        },
      });
      setStatus("Meeting prep card will be generated shortly.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger meeting prep.");
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
          variant="outline"
          size="sm"
          className="fixed bottom-5 right-5 z-[60] rounded-none border-border bg-background"
          onClick={() => setOpen(true)}
        >
          <TerminalSquare className="h-4 w-4" />
          Demo Tools
        </Button>
      ) : null}

      {(inline || open) ? (
        <div
          className={
            inline
              ? "w-full"
              : "fixed inset-y-0 right-0 z-[70] w-full max-w-[420px] border-l border-border bg-background"
          }
        >
          <Card className={inline ? "border-border bg-card rounded-none" : "flex h-full min-h-0 flex-col border-0 bg-background rounded-none"}>
            <CardHeader className="gap-4 border-b border-border pb-6">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-3">
                  <Badge variant="outline" className="w-fit rounded-none border-border bg-background text-foreground">
                    {inline ? "Demo Actions" : "Presenter Overlay"}
                  </Badge>
                  <CardTitle className="font-sans text-3xl font-black uppercase tracking-[-0.06em] text-foreground">
                    Demo Command Center
                  </CardTitle>
                  <p className="max-w-sm text-sm leading-7 text-foreground/60">
                    Demo mode should only dispatch seeded scenarios to a chosen workspace. The rest of the product should behave like the normal app.
                  </p>
                </div>
                {!inline ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="rounded-none border border-border"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 overflow-y-auto p-6">
              <div className="grid gap-6">
                <div className="grid gap-3 border border-border px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/50">
                    Target Workspace
                  </p>
                  <Input
                    value={targetUserId}
                    onChange={(event) => setTargetUserId(event.target.value)}
                    placeholder="Paste the user id to receive the scenario"
                    className="rounded-none border-neutral-300 bg-white text-black"
                  />
                  <p className="text-xs leading-6 text-foreground/60">
                    {user?.id
                      ? `Current session user: ${user.id}`
                      : "Sign in first, or paste a valid user id manually."}
                  </p>
                </div>

              {scenarios.length > 0 ? (
                <div className="grid gap-3 border border-border px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/50">
                      Scenario Run
                    </p>
                    <Badge variant="outline" className="rounded-none">{scenarios.length}</Badge>
                  </div>
                  <div className="grid gap-2">
                    {scenarios.map((scenario) => (
                      <Button
                        key={scenario.name}
                        className="h-auto w-full justify-between rounded-none px-4 py-4"
                        disabled={busy !== null || !targetUserId.trim()}
                        variant="outline"
                        onClick={() => void runScenario(scenario.name)}
                      >
                        <span className="grid text-left">
                          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
                            <Activity className="h-4 w-4" />
                            {scenario.name.replace(/_/g, " ")}
                          </span>
                          <span className="mt-1 text-[11px] font-medium normal-case tracking-normal opacity-70">
                            Sources: {scenario.sources.join(", ")}
                          </span>
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">{scenario.event_count} evt</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 border border-border px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/50">
                  Meeting Prep
                </p>
                <Button
                  className="h-auto w-full justify-between rounded-none px-4 py-4"
                  disabled={busy !== null || !targetUserId.trim()}
                  variant="outline"
                  onClick={() => void triggerMeetingPrep()}
                >
                  <span className="grid text-left">
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]">
                      <Calendar className="h-4 w-4" />
                      Trigger Meeting Prep
                    </span>
                    <span className="mt-1 text-[11px] font-medium normal-case tracking-normal opacity-70">
                      Generate prep card for Executive Briefing
                    </span>
                  </span>
                </Button>
              </div>

              {status ? (
                <div className="border border-border bg-background px-4 py-3 text-sm text-foreground/70">{status}</div>
              ) : null}
              {error ? (
                <div className="border border-border bg-primary px-4 py-3 text-sm text-primary-foreground">{error}</div>
              ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
