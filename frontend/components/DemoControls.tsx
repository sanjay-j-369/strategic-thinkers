"use client";

import { useEffect, useState } from "react";
import {
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

export function DemoControls() {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<
    "bootstrap" | "email" | "slack" | "prep" | "growth" | "reset" | null
  >(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (!DEMO_MODE) return null;

  return (
    <>
      {!open ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="fixed bottom-5 right-5 z-[60]"
          onClick={() => setOpen(true)}
        >
          <TerminalSquare className="h-4 w-4" />
          Demo
        </Button>
      ) : null}

      {open ? (
        <div className="fixed inset-y-0 right-0 z-[70] w-full max-w-sm border-l border-border bg-card p-4 shadow-2xl backdrop-blur-xl">
          <Card className="h-full border-border bg-zinc-950/90">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                  <Badge className="w-fit">Presenter Overlay</Badge>
                  <CardTitle className="text-lg">Demo Command Center</CardTitle>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full justify-start"
                disabled={busy !== null}
                variant="secondary"
                onClick={() =>
                  runAction(
                    "bootstrap",
                    "/api/demo/bootstrap",
                    "Full demo timeline queued.",
                    { reset: false }
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
