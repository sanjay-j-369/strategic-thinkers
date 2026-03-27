"use client";
import { useFounderFeed } from "@/lib/websocket";
import { PrepCard } from "@/components/PrepCard";
import { GuideCard } from "@/components/GuideCard";

const DEMO_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID || "d4c615b8-cedc-4c97-80ed-2c8373610d78";

export default function FeedPage() {
  const cards = useFounderFeed(DEMO_USER_ID);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Hero */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-indigo-300 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live Intelligence Feed
        </div>
        <h1 className="text-4xl font-bold text-gradient mb-3">
          Your Founder Command Center
        </h1>
        <p className="text-gray-400 text-base">
          Real-time briefings from your Gmail, Slack, and Calendar — processed by AI.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Cards Today", value: cards.length, icon: "⚡", color: "indigo" },
          { label: "Meetings Prepped", value: cards.filter(c => c.type === "ASSISTANT_PREP").length, icon: "📅", color: "amber" },
          { label: "Insights", value: cards.filter(c => c.type === "GUIDE_QUERY").length, icon: "🧭", color: "purple" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className={`glass rounded-xl p-4 glow-${color}`}>
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Feed */}
      {cards.length === 0 ? (
        <div className="glass rounded-2xl p-16 text-center animate-fade-in">
          <div className="text-5xl mb-4">⚡</div>
          <p className="text-lg text-white font-medium mb-2">Waiting for intelligence cards...</p>
          <p className="text-sm text-gray-500">
            Go to <a href="/ingest" className="text-indigo-400 hover:underline">Ingest</a> to add emails or Slack messages,
            or <a href="/meetings" className="text-amber-400 hover:underline">Meetings</a> to schedule a prep.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {cards.map((card, i) =>
            card.type === "ASSISTANT_PREP" ? (
              <PrepCard key={i} data={card} />
            ) : (
              <GuideCard key={i} data={card} />
            )
          )}
        </div>
      )}
    </div>
  );
}
