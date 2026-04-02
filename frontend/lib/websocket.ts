import { useEffect, useRef, useState } from "react";

const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001").replace(
    /^http/,
    "ws"
  );

export function useFounderFeed(userId: string) {
  const [cards, setCards] = useState<any[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!userId) return;

    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!active) return;

      ws.current = new WebSocket(`${WS_BASE_URL}/ws/${userId}`);

      ws.current.onmessage = (event) => {
        const card = JSON.parse(event.data);
        setCards((prev) => [card, ...prev]);
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

  return cards;
}
