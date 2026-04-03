import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(
    /^http/,
    "ws"
  );

interface SummaryItem {
  id: string;
  type: string;
  topic?: string;
  summary_text?: string;
  generated_at: string;
  payload?: Record<string, unknown>;
}

function toCard(summary: SummaryItem): any | null {
  const payload = summary.payload;

  if (payload && typeof payload === "object" && "type" in payload) {
    return payload;
  }

  if (summary.type === "ASSISTANT_PREP") {
    return {
      type: "ASSISTANT_PREP",
      topic: summary.topic || "Meeting",
      summary: summary.summary_text || "",
      generated_at: summary.generated_at,
    };
  }

  if (summary.type === "GUIDE_QUERY" || summary.type === "GUIDE_MILESTONE") {
    return {
      type: "GUIDE_QUERY",
      question: summary.topic || "Strategic insight",
      output: summary.summary_text || "",
      generated_at: summary.generated_at,
    };
  }

  return null;
}

function mergeCards(current: any[], incoming: any[]) {
  const seen = new Set<string>();
  const merged = [...incoming, ...current].filter((card) => {
    const key = `${card.type}-${card.generated_at}-${card.topic || card.question || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return merged.sort(
    (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
  );
}

export function useFounderFeed(userId: string, token?: string | null) {
  const [cards, setCards] = useState<any[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!userId || !token) return;

    let mounted = true;

    async function loadSummaries() {
      try {
        const data = await apiFetch<{ summaries: SummaryItem[] }>(
          "/api/summaries?limit=40",
          { token }
        );
        if (!mounted) return;
        const fetched = (data.summaries || [])
          .map((item) => toCard(item))
          .filter(Boolean) as any[];
        setCards((prev) => mergeCards(prev, fetched));
      } catch {
        // Keep existing cards; websocket may still deliver live items.
      }
    }

    void loadSummaries();
    const pollId = setInterval(() => {
      void loadSummaries();
    }, 8000);

    return () => {
      mounted = false;
      clearInterval(pollId);
    };
  }, [token, userId]);

  useEffect(() => {
    if (!userId) return;

    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!active) return;

      ws.current = new WebSocket(`${WS_BASE_URL}/ws/${userId}`);

      ws.current.onmessage = (event) => {
        const card = JSON.parse(event.data);
        if (card?.type === "DEMO_RESET") {
          setCards([]);
          return;
        }
        setCards((prev) => mergeCards(prev, [card]));
      };

      ws.current.onerror = () => console.warn("WS error, retrying...");

      ws.current.onclose = () => {
        if (!active) return;
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws.current?.close();
    };
  }, [userId]);

  useEffect(() => {
    function onReset() {
      setCards([]);
    }
    window.addEventListener("demo:reset-feed", onReset);
    return () => window.removeEventListener("demo:reset-feed", onReset);
  }, []);

  return cards;
}
