import { AlertCircle, Clock3, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GuideCardData {
  type: "GUIDE_QUERY";
  question: string;
  analysis?: string;
  red_flags?: string[];
  output?: string;
  generated_at: string;
}

export function GuideCard({ data }: { data: GuideCardData }) {
  const outputLines = data.output?.split("\n").filter(Boolean) || [];

  return (
    <Card className="overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <CardHeader className="border-b border-white/10 pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-4">
            <Badge variant="secondary" className="w-fit">
              Strategic Insight
            </Badge>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-lg">{data.question}</CardTitle>
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Clock3 className="h-4 w-4" />
                  {new Date(data.generated_at).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-6">
        {data.analysis ? (
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <p className="mono-label mb-2">Situation Analysis</p>
            <p className="text-sm leading-7 text-zinc-300">{data.analysis}</p>
          </div>
        ) : null}

        {data.red_flags && data.red_flags.length > 0 ? (
          <div className="space-y-3">
            <p className="mono-label">Key Risks</p>
            <div className="space-y-2">
              {data.red_flags.map((flag) => (
                <div
                  key={flag}
                  className="flex items-start gap-3 rounded-[22px] border border-white/10 bg-black/40 p-4"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300" />
                  <p className="text-sm leading-7 text-zinc-300">{flag}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {outputLines.length > 0 ? (
          <div>
            <p className="mono-label mb-3">Decision Framework</p>
            <div className="space-y-2">
              {outputLines.map((line, index) => (
                <p key={`${line}-${index}`} className="text-sm leading-7 text-zinc-300">
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
