"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

type ScenarioListResponse = {
  items: Array<{
    name: string;
    event_count: number;
    sources: string[];
    first_timestamp: string | null;
  }>;
};

type AdminLogEvent = {
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
};

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

export function DemoSimulator() {
  const [userId, setUserId] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioListResponse["items"]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [logs, setLogs] = useState<AdminLogEvent[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [firing, setFiring] = useState(false);
  const [socketState, setSocketState] = useState<"connecting" | "open" | "closed">("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let active = true;

    async function loadScenarios() {
      setLoadingScenarios(true);
      setError(null);
      try {
        const data = await apiFetch<ScenarioListResponse>("/api/demo/scenarios");
        if (!active) return;
        setScenarios(data.items || []);
        setScenarioName((current) => current || data.items?.[0]?.name || "");
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load scenarios.");
      } finally {
        if (active) {
          setLoadingScenarios(false);
        }
      }
    }

    void loadScenarios();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      if (!active) return;
      setSocketState("connecting");
      const ws = new WebSocket(`${resolveWsBase()}/ws/admin/logs`);
      wsRef.current = ws;

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
        setLogs((current) => [payload, ...current].slice(0, 300));
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
      wsRef.current?.close();
    };
  }, []);

  const visibleLogs = useMemo(() => {
    if (!userId.trim()) {
      return logs;
    }
    return logs.filter((log) => log.user_id === userId.trim());
  }, [logs, userId]);

  async function fireScenario() {
    if (!userId.trim() || !scenarioName) return;
    setFiring(true);
    setStatus(null);
    setError(null);

    try {
      const result = await apiFetch<{ queued: number }>("/api/demo/trigger-scenario", {
        method: "POST",
        json: {
          user_id: userId.trim(),
          scenario_name: scenarioName,
        },
      });
      setStatus(`Queued ${result.queued} event(s) from ${scenarioName}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fire scenario.");
    } finally {
      setFiring(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3">
        <Badge className="w-fit">Admin / Demo Dashboard</Badge>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Demo Simulator
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Target any tenant by `user_id`, fire a predefined scenario through the real
            ingestion queue, and watch live LangGraph execution logs as the pipeline runs.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Scenario Controls</CardTitle>
            <CardDescription>
              Demo endpoints are active only when backend `DEMO_MODE=true`.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="demo-user-id">Target User ID</Label>
              <Input
                id="demo-user-id"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="550e8400-e29b-41d4-a716-446655440000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="demo-scenario">Scenario</Label>
              <select
                id="demo-scenario"
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loadingScenarios || scenarios.length === 0}
                value={scenarioName}
                onChange={(event) => setScenarioName(event.target.value)}
              >
                {scenarios.length === 0 ? (
                  <option value="">No scenarios available</option>
                ) : null}
                {scenarios.map((scenario) => (
                  <option key={scenario.name} value={scenario.name}>
                    {scenario.name} ({scenario.event_count} events)
                  </option>
                ))}
              </select>
            </div>

            {scenarioName ? (
              <div className="rounded-none border border-border bg-secondary p-3 text-sm text-muted-foreground -sm">
                {scenarios
                  .filter((scenario) => scenario.name === scenarioName)
                  .map((scenario) => (
                    <div key={scenario.name} className="space-y-1">
                      <p>Sources: {scenario.sources.join(", ") || "n/a"}</p>
                      <p>Events: {scenario.event_count}</p>
                      <p>First timestamp: {scenario.first_timestamp || "n/a"}</p>
                    </div>
                  ))}
              </div>
            ) : null}

            <Button
              className="w-full"
              disabled={firing || !userId.trim() || !scenarioName}
              onClick={fireScenario}
            >
              {firing ? "Firing Scenario..." : "Fire Scenario"}
            </Button>

            {status ? (
              <p className="rounded-none border border-border bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground -sm">
                {status}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-none border border-border bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground -sm">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="min-h-[620px] border-border bg-foreground text-background">
          <CardHeader className="border-b-2 border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-background">Terminal / Log Viewer</CardTitle>
                <CardDescription className="text-background/70">
                  WebSocket: `/ws/admin/logs`
                </CardDescription>
              </div>
              <Badge
                variant={socketState === "open" ? "default" : "secondary"}
                className={socketState === "open" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}
              >
                {socketState}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[540px] overflow-y-auto p-0">
            <div className="flex h-full flex-col gap-2 p-4 font-mono text-xs leading-6">
              {visibleLogs.length === 0 ? (
                <div className="rounded-none border border-dashed border-background/40 bg-foreground p-4 text-background/60">
                  Waiting for live agent logs.
                </div>
              ) : null}
              {visibleLogs.map((log) => (
                <div
                  key={log.log_id}
                  className="rounded-none border border-background bg-secondary px-3 py-2 text-foreground -sm"
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-foreground/65">
                    <span>{new Date(log.generated_at).toLocaleTimeString()}</span>
                    <span>{log.pillar}</span>
                    <span>{log.agent_name}</span>
                    {log.user_id ? <span>{log.user_id}</span> : null}
                    {log.node_name ? <span>{log.node_name}</span> : null}
                  </div>
                  <div className="mt-1 text-foreground">{log.message}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
