import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { SignalItem } from "@/components/SignalCard";

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(
    /^http/,
    "ws"
  );

function mergeSignals(current: SignalItem[], incoming: SignalItem[]) {
  const seen = new Set<string>();
  const merged = [...incoming, ...current].filter((card) => {
    const key = card.id || `${card.notification_type || card.type}-${card.created_at || card.generated_at}-${card.title || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return merged.sort(
    (a, b) =>
      new Date(b.created_at || b.generated_at || 0).getTime() -
      new Date(a.created_at || a.generated_at || 0).getTime()
  );
}

function sortSignals(items: SignalItem[]) {
  return [...items].sort(
    (a, b) =>
      new Date(b.created_at || b.generated_at || 0).getTime() -
      new Date(a.created_at || a.generated_at || 0).getTime()
  );
}

export function useFounderFeed(userId: string, token?: string | null) {
  const [cards, setCards] = useState<SignalItem[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!userId || !token) return;

    let mounted = true;

    async function loadSummaries() {
      try {
        const data = await apiFetch<{ items: SignalItem[] }>(
          "/api/ops/notifications?limit=50",
          { token }
        );
        if (!mounted) return;
        setCards(sortSignals(data.items || []));
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
        const card = JSON.parse(event.data) as SignalItem & { type?: string };
        if (card?.type === "DEMO_RESET") {
          setCards([]);
          return;
        }
        setCards((prev) => mergeSignals(prev, [card]));
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
