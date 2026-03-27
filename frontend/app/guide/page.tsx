"use client";
import { useState, useRef, useEffect } from "react";

const API_URL = "http://localhost:8000";
const DEMO_USER_ID = "d4c615b8-cedc-4c97-80ed-2c8373610d78";

const STARTERS = [
  "Should I hire a CTO now or keep outsourcing?",
  "We have 4 months runway. Raise or cut costs?",
  "Our MRR is $8k and an investor wants Series A terms. Too early?",
  "Should I hire sales before product-market fit?",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hey, I'm your strategic AI advisor. I have context from your emails, Slack, and meetings. Ask me anything about your startup.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          message: msg,
          history: newMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-purple-300 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Strategic AI Advisor
        </div>
        <h1 className="text-2xl font-bold text-white">Ask the Guide</h1>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "bg-indigo-600 text-white rounded-br-sm"
                : "glass text-gray-200 rounded-bl-sm"
            }`}>
              {m.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-4 h-4 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[8px] font-bold">F</div>
                  <span className="text-xs text-gray-400 font-medium">Guide</span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="glass rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Starter chips — only show at start */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {STARTERS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-full glass glass-hover text-gray-300 hover:text-white transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="glass rounded-2xl p-2 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask a strategic question..."
          disabled={loading}
          className="flex-1 bg-transparent px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none text-sm"
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-all"
        >
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
