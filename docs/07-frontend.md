# 07 — Frontend (Next.js 14)

The frontend is a **real-time intelligence feed** — not a traditional dashboard. Cards stream in live via WebSocket and stack chronologically, similar to how a high-end news feed feels.

---

## Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Feed | Real-time card stream (Assistant + Guide outputs) |
| `/guide` | Guide Chat | Ask the Guide a question |
| `/privacy` | Privacy Center | View/delete ingested data |

---

## Card Types

### PrepCard (amber accent)
Appears automatically before a meeting, no founder action needed.

```
┌─────────────────────────────────────────┐
│ 🟡  MEETING PREP — In 28 min            │
│  Q2 Roadmap Review · marcus@client-co  │
├─────────────────────────────────────────┤
│ Last promise:  API rate limit fix by Fri│
│ Friction:      429s still in prod       │
│ Suggested goal: Align on fix timeline   │
└─────────────────────────────────────────┘
```

### GuideCard (indigo accent)
Appears after a Guide query completes.

```
┌─────────────────────────────────────────┐
│ 🟣  STRATEGIC INSIGHT                   │
│  Should I hire a CTO?                  │
├─────────────────────────────────────────┤
│ Situation: Dev spend 62% of burn        │
│ Benchmark: Sequoia threshold is 50%     │
│ 🚩 Red Flag: No technical co-founder    │
│                                         │
│ 3-Step Plan:                            │
│  1. Define CTO scope...                 │
│  2. Run 30-day structured search...     │
│  3. Offer 2-4% equity...               │
└─────────────────────────────────────────┘
```

---

## Real-Time WebSocket Hook

**File:** `frontend/lib/websocket.ts`

```typescript
import { useEffect, useRef, useState } from "react";

export function useFounderFeed(userId: string) {
  const [cards, setCards] = useState<any[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    ws.current = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL}/ws/${userId}`
    );

    ws.current.onmessage = (e) => {
      const card = JSON.parse(e.data);
      setCards((prev) => [card, ...prev]);  // Newest at top
    };

    ws.current.onerror = () => console.warn("WS error — retrying...");

    return () => ws.current?.close();
  }, [userId]);

  return cards;
}
```

---

## Feed Page

**File:** `frontend/app/page.tsx`

```tsx
"use client";
import { useFounderFeed } from "@/lib/websocket";
import { PrepCard } from "@/components/PrepCard";
import { GuideCard } from "@/components/GuideCard";

export default function FeedPage() {
  const { userId } = useAuth();   // from Clerk / NextAuth
  const cards = useFounderFeed(userId);

  return (
    <main className="max-w-2xl mx-auto py-8 space-y-4">
      {cards.map((card, i) => (
        card.type === "ASSISTANT_PREP"
          ? <PrepCard key={i} data={card} />
          : <GuideCard key={i} data={card} />
      ))}
    </main>
  );
}
```

---

## Guide Chat Page

**File:** `frontend/app/guide/page.tsx`

```
1. Founder types a question in a text input
2. POST /api/guide  { question: "Should I hire a CTO?" }
3. FastAPI enqueues a GUIDE_QUERY task (priority 2)
4. Worker runs LangGraph → result pushed via WebSocket
5. GuideCard appears in the feed & in the guide chat thread
```

---

## Privacy Center

**File:** `frontend/app/privacy/page.tsx`

A paginated table of all ingested items:

| Column | Value |
|--------|-------|
| Source | GMAIL / SLACK / CALENDAR |
| Date | 2024-05-20 09:30 |
| Tags | customer, gtm |
| Actions | 👁 View · 🗑 Forget |

- **View** → `GET /api/archive/{id}` — server decrypts with Fernet and returns plaintext (never stored decrypted)
- **Forget** → `DELETE /api/archive/{id}` — removes from Postgres + deletes vector from Pinecone

---

## Tech Stack — Frontend

| Choice | Reason |
|--------|--------|
| Next.js 14 App Router | RSC for fast initial load; client components for real-time feed |
| Tailwind CSS | Utility-first, pairs well with Shadcn/UI |
| Shadcn/UI | Accessible, unstyled primitives — easy to customise card designs |
| Native WebSocket | No extra library — FastAPI WS endpoint is straightforward |
| Clerk (auth) | Drop-in OAuth — handles Google login, session management |
