"use client";
import { useState } from "react";
import { GuideCard } from "@/components/GuideCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEMO_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID || "demo-user-123";

export default function GuidePage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [responses, setResponses] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/guide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, user_id: DEMO_USER_ID }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      // The actual result will arrive via WebSocket — show a pending state
      setResponses((prev) => [
        { type: "GUIDE_PENDING", question, task_id: data.task_id },
        ...prev,
      ]);
      setQuestion("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Strategic Guide</h1>
        <p className="text-gray-400 text-sm mt-1">
          Ask high-stakes questions. Get a structured decision framework.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Should I hire a CTO? Should I raise now?"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            {loading ? "Thinking..." : "Ask"}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </form>

      <div className="space-y-4">
        {responses.map((item, i) =>
          item.type === "GUIDE_PENDING" ? (
            <div
              key={i}
              className="border border-indigo-800 bg-indigo-950/30 rounded-xl p-4 animate-pulse"
            >
              <p className="text-indigo-300 text-sm font-medium">Processing...</p>
              <p className="text-white mt-1">{item.question}</p>
              <p className="text-gray-500 text-xs mt-2">
                Result will appear in your feed when ready.
              </p>
            </div>
          ) : (
            <GuideCard key={i} data={item} />
          )
        )}
      </div>
    </div>
  );
}
