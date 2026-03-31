import { useEffect, useRef, useState } from "react";

export function useFounderFeed(userId: string) {
  const [cards, setCards] = useState<any[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!userId) return;

    ws.current = new WebSocket(`ws://localhost:8001/ws/${userId}`);

    ws.current.onmessage = (e) => {
      const card = JSON.parse(e.data);
      setCards((prev) => [card, ...prev]); // Newest at top
    };

    ws.current.onerror = () => console.warn("WS error — retrying...");

    ws.current.onclose = () => {
      // Attempt reconnect after 3 seconds
      setTimeout(() => {
        if (ws.current?.readyState === WebSocket.CLOSED) {
          ws.current = new WebSocket(
            `${process.env.NEXT_PUBLIC_WS_URL}/ws/${userId}`
          );
        }
      }, 3000);
    };

    return () => ws.current?.close();
  }, [userId]);

  return cards;
}
