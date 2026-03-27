"use client";
import { useState, useEffect } from "react";
import { PrivacyTable } from "@/components/PrivacyTable";

const API_URL = "http://localhost:8000";
const DEMO_USER_ID = "d4c615b8-cedc-4c97-80ed-2c8373610d78";

export default function PrivacyPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/archive?user_id=${DEMO_USER_ID}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { fetchItems(); }, [page]);

  async function handleView(id: string) {
    const res = await fetch(`${API_URL}/api/archive/${id}?user_id=${DEMO_USER_ID}`);
    const data = await res.json();
    alert(data.content || "No content available");
  }

  async function handleDelete(id: string) {
    if (!confirm("Permanently delete this item from your archive and Pinecone?")) return;
    await fetch(`${API_URL}/api/archive/${id}?user_id=${DEMO_USER_ID}`, { method: "DELETE" });
    fetchItems();
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-emerald-300 mb-4">
          <span>🔒</span> Privacy Center
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Your Data Archive</h1>
        <p className="text-gray-400">All ingested data — PII redacted. View the original or delete permanently from Postgres and Pinecone.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Items", value: total, icon: "📦" },
          { label: "PII Redacted", value: total, icon: "🛡️" },
          { label: "Encrypted", value: total, icon: "🔐" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="glass rounded-xl p-4">
            <div className="text-2xl mb-1">{icon}</div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400">{label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="glass rounded-2xl p-16 text-center">
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading archive...</p>
        </div>
      ) : (
        <>
          <div className="glass rounded-2xl overflow-hidden">
            <PrivacyTable items={items} onView={handleView} onDelete={handleDelete} />
          </div>
          <div className="flex items-center justify-between mt-4 text-sm text-gray-400 px-1">
            <span>{total} total items</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg glass glass-hover disabled:opacity-40 transition-all"
              >
                ← Prev
              </button>
              <span className="px-3 py-1.5 text-gray-300">Page {page + 1}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= total}
                className="px-3 py-1.5 rounded-lg glass glass-hover disabled:opacity-40 transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
