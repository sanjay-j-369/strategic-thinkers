"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Inbox,
  Sparkles,
  Waves,
} from "lucide-react";

import { GuideCard } from "@/components/GuideCard";
import { PrepCard } from "@/components/PrepCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useFounderFeed } from "@/lib/websocket";

const DEMO_USER_ID =
  process.env.NEXT_PUBLIC_DEMO_USER_ID || "d4c615b8-cedc-4c97-80ed-2c8373610d78";

const fadeTransition = (delay: number) => ({
  duration: 0.35,
  delay,
  ease: [0.22, 1, 0.36, 1] as const,
});

export default function FeedPage() {
  const cards = useFounderFeed(DEMO_USER_ID);
  const prepCount = cards.filter((card) => card.type === "ASSISTANT_PREP").length;
  const insightCount = cards.filter((card) => card.type === "GUIDE_QUERY").length;

  const metrics = [
    {
      label: "Cards Received",
      value: cards.length,
      icon: Activity,
      note: "Live websocket stream",
    },
    {
      label: "Meeting Preps",
      value: prepCount,
      icon: CalendarDays,
      note: "Upcoming conversations",
    },
    {
      label: "Strategic Notes",
      value: insightCount,
      icon: Sparkles,
      note: "Guide decisions captured",
    },
  ];

  return (
    <div className="space-y-8">
      <motion.section
        className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_360px]"
      >
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={fadeTransition(0)}
        >
          <Card className="h-full overflow-hidden">
            <CardHeader className="gap-5 pb-8">
              <Badge className="w-fit">Live Intelligence Feed</Badge>
              <div className="space-y-4">
                <CardTitle className="max-w-3xl text-4xl md:text-5xl">
                  Minimal founder operations, tuned for fast decisions.
                </CardTitle>
                <CardDescription className="max-w-2xl text-base text-zinc-400 text-balance">
                  Real-time briefings from Gmail, Slack, and calendar context,
                  surfaced in a monochrome workspace built for high-signal review.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 border-t border-white/10 pt-6 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/ingest">
                    Add Source Material
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/guide">Ask the Guide</Link>
                </Button>
              </div>

              <div className="grid gap-3 text-sm text-zinc-400 sm:grid-cols-3 md:text-right">
                <div>
                  <p className="mono-label mb-1">Latency</p>
                  <p className="text-zinc-100">Streaming</p>
                </div>
                <div>
                  <p className="mono-label mb-1">Surfaces</p>
                  <p className="text-zinc-100">Feed / Guide / Privacy</p>
                </div>
                <div>
                  <p className="mono-label mb-1">Mode</p>
                  <p className="text-zinc-100">Operator View</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={fadeTransition(0.06)}
        >
          <Card className="h-full">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                System Readiness
              </Badge>
              <CardTitle className="text-2xl">Focused, live, and quiet by default.</CardTitle>
              <CardDescription>
                Signals only surface when they matter. Everything else stays in the archive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  icon: Inbox,
                  label: "Ingestion",
                  value: "Manual or connected inputs",
                },
                {
                  icon: Sparkles,
                  label: "Guide",
                  value: "Context-aware strategy replies",
                },
                {
                  icon: Waves,
                  label: "Feed",
                  value: "Streaming updates over websocket",
                },
              ].map(({ icon: Icon, label, value }) => (
                <div
                  key={label}
                  className="flex items-center gap-4 rounded-[22px] border border-white/10 bg-black/30 px-4 py-4"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                    <Icon className="h-4 w-4 text-zinc-200" />
                  </div>
                  <div>
                    <p className="mono-label mb-1">{label}</p>
                    <p className="text-sm text-zinc-200">{value}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </motion.section>

      <motion.section
        className="grid gap-4 md:grid-cols-3"
      >
        {metrics.map(({ label, value, icon: Icon, note }, index) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={fadeTransition((index + 2) * 0.06)}
          >
            <Card>
              <CardContent className="flex items-start justify-between gap-4 pt-6">
                <div className="space-y-2">
                  <p className="mono-label">{label}</p>
                  <p className="text-4xl font-semibold tracking-[-0.05em] text-white">
                    {value}
                  </p>
                  <p className="text-sm text-zinc-500">{note}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                  <Icon className="h-4 w-4 text-zinc-100" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mono-label mb-2">Recent Signals</p>
            <h2 className="text-2xl font-semibold text-white">Operational feed</h2>
          </div>
          <Badge variant="secondary">Newest items stay on top</Badge>
        </div>

        {cards.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.05]">
                <Activity className="h-6 w-6 text-zinc-100" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-white">
                  Waiting for the first signal
                </h3>
                <p className="max-w-xl text-sm leading-7 text-zinc-500">
                  Add an email, Slack message, or meeting and the processed cards will land here.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link href="/ingest">Open Ingest</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/meetings">Schedule Meeting</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {cards.map((card, index) => (
              <motion.div
                key={`${card.type}-${card.generated_at}-${index}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: index * 0.03 }}
              >
                {card.type === "ASSISTANT_PREP" ? (
                  <PrepCard data={card} />
                ) : (
                  <GuideCard data={card} />
                )}
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
