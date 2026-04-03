import { ArrowUpRight, CalendarDays, Clock3, Link2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PrepCardData {
  type: "ASSISTANT_PREP";
  topic: string;
  summary: string;
  promises?: string[];
  unresolved_loops?: Array<{ text: string; source_url?: string | null }>;
  jump_to_thread_url?: string | null;
  entities?: string[];
  generated_at: string;
}

export function PrepCard({ data }: { data: PrepCardData }) {
  const lines = data.summary?.split("\n").filter(Boolean) || [];
  const unresolved = data.unresolved_loops || [];
  const promises = data.promises || [];

  return (
    <Card className="overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <CardHeader className="border-b border-white/10 pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-4">
            <Badge variant="secondary" className="w-fit">
              Meeting Prep
            </Badge>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                <CalendarDays className="h-5 w-5 text-white" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-lg">{data.topic}</CardTitle>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Clock3 className="h-4 w-4" />
                  {new Date(data.generated_at).toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {data.entities && data.entities.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 md:max-w-[40%] md:justify-end">
              <span className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-zinc-500">
                <Users className="h-4 w-4" />
                People
              </span>
              {data.entities.slice(0, 3).map((entity) => (
                <Badge key={entity} variant="outline" className="tracking-[0.16em]">
                  {entity.split("@")[0]}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        {data.jump_to_thread_url ? (
          <Button asChild variant="secondary" className="w-fit">
            <a href={data.jump_to_thread_url} target="_blank" rel="noopener noreferrer">
              Jump to Thread
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        ) : null}

        {lines.map((line, index) => (
          <p key={`${line}-${index}`} className="text-sm leading-7 text-zinc-300">
            {line}
          </p>
        ))}

        {promises.length > 0 ? (
          <div>
            <p className="mono-label mb-2">Promises</p>
            <div className="space-y-2">
              {promises.map((promise, index) => (
                <p key={`${promise}-${index}`} className="text-sm leading-7 text-zinc-300">
                  {promise}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {unresolved.length > 0 ? (
          <div>
            <p className="mono-label mb-2">Unresolved Loops</p>
            <div className="space-y-3">
              {unresolved.map((loop, index) => (
                <div
                  key={`${loop.text}-${index}`}
                  className="rounded-[20px] border border-white/10 bg-black/30 p-3"
                >
                  <p className="text-sm leading-7 text-zinc-300">{loop.text}</p>
                  {loop.source_url ? (
                    <a
                      href={loop.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-zinc-400 hover:text-zinc-200"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Thread
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
