"use client";
import { useFounderFeed } from "@/lib/websocket";
import { PrepCard } from "@/components/PrepCard";
import { GuideCard } from "@/components/GuideCard";
import { Feed } from "@/components/Feed";

// Demo user ID — replace with useAuth() from Clerk in production
const DEMO_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID || "demo-user-123";

export default function FeedPage() {
  // In production: const { userId } = useAuth();
  const userId = DEMO_USER_ID;
  const cards = useFounderFeed(userId);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Intelligence Feed</h1>
        <p className="text-gray-400 text-sm mt-1">
          Real-time briefings from your Gmail, Slack, and Calendar
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-4">⚡</div>
          <p className="text-lg">Waiting for intelligence cards...</p>
          <p className="text-sm mt-2">
            Cards will appear here as meetings approach and guide queries complete.
          </p>
        </div>
      ) : (
        <Feed>
          {cards.map((card, i) =>
            card.type === "ASSISTANT_PREP" ? (
              <PrepCard key={i} data={card} />
            ) : (
              <GuideCard key={i} data={card} />
            )
          )}
        </Feed>
      )}
    </div>
  );
}
