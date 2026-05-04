"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, ArrowUpRight, BellRing, Bot, Briefcase, ChevronDown, ChevronUp, Clock3, Flame, Radar, Sparkles } from "lucide-react";
import { useState } from "react";

import { GuideCard } from "@/components/GuideCard";
import { PrepCard } from "@/components/PrepCard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SignalItem {
  id?: string;
  pillar?: string;
  agent_name?: string;
  notification_type?: string;
  severity?: string;
  title?: string;
  body?: string;
  payload?: Record<string, unknown> | null;
  created_at?: string;
  read_at?: string | null;
  type?: string;
  generated_at?: string;
}

function stringifyPayloadValue(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function signalIcon(type?: string, pillar?: string) {
  if (type === "VIP_INTERRUPT") return BellRing;
  if (type === "RUNWAY_ALERT") return Flame;
  if (type === "BURNOUT_ALERT") return AlertTriangle;
  if (type === "HIRING_TRIGGER") return Briefcase;
  if (pillar === "WORKER") return Radar;
  if (pillar === "MENTOR") return Sparkles;
  return Bot;
}

function signalTone(severity?: string) {
  if (severity === "critical" || severity === "warning") return "bg-primary";
  return "bg-card";
}

export function SignalCard({ signal }: { signal: SignalItem }) {
  const [expanded, setExpanded] = useState(false);
  const payload = signal.payload;
  const embeddedType =
    payload && typeof payload === "object" && "type" in payload ? String(payload.type) : signal.type;

  if (embeddedType === "ASSISTANT_PREP" && payload && typeof payload === "object") {
    return <PrepCard data={payload as any} />;
  }

  if (embeddedType === "GUIDE_QUERY" && payload && typeof payload === "object") {
    return <GuideCard data={payload as any} />;
  }

  const Icon = signalIcon(signal.notification_type, signal.pillar);
  const timestamp = signal.created_at || signal.generated_at;

  return (
    <Card className="border border-border bg-card overflow-hidden cursor-pointer" onClick={() => setExpanded(!expanded)}>
      <CardHeader className="border-b-2 border-border pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className={`mt-1 flex h-12 w-12 items-center justify-center border border-border ${signalTone(signal.severity)}`}>
              <Icon className="h-5 w-5 text-foreground" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{signal.pillar || "SYSTEM"}</Badge>
                <Badge variant="outline">{signal.notification_type || "SIGNAL"}</Badge>
                {signal.read_at ? null : <Badge variant="secondary">new</Badge>}
              </div>
              <CardTitle className="font-sans text-2xl font-black uppercase tracking-tight">
                {signal.title || "Untitled signal"}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-foreground/60">
                <span>{signal.agent_name || "Founder OS"}</span>
                {timestamp ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    {new Date(timestamp).toLocaleString()}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {signal.body && signal.body.length > 300 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-xs font-black uppercase tracking-[0.18em] hover:bg-accent"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Show Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Show More
                  </>
                )}
              </button>
            )}
            {payload && typeof payload === "object" && typeof payload.source_url === "string" ? (
              <a
                href={payload.source_url}
                target="_blank"
                rel="noreferrer"
                className=" inline-flex items-center gap-2 border border-border bg-card px-3 py-2 text-xs font-black uppercase tracking-[0.18em]"
              >
                Source
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="text-sm leading-7 text-foreground dark:text-foreground/90 [&_strong]:font-semibold [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_ul]:mt-2 [&_ol]:mt-2 [&_li]:mt-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {signal.body ? (expanded ? signal.body : (signal.body.length > 300 ? signal.body.slice(0, 300) + "..." : signal.body)) : "No body available."}
          </ReactMarkdown>
        </div>
        {payload && typeof payload === "object" && Object.keys(payload).length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2">
            {Object.entries(payload)
              .filter(([key, value]) => key !== "type" && key !== "summary" && key !== "output" && value != null && typeof value !== "object")
              .slice(0, 6)
              .map(([key, value]) => (
                <div key={key} className=" border border-border bg-card px-3 py-3">
                  <p className="mono-label text-foreground/50">{key.replace(/_/g, " ")}</p>
                  <p className="mt-1 text-sm font-medium text-foreground">{stringifyPayloadValue(value)}</p>
                </div>
              ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
