"use client";
import { useState, useEffect } from "react";
import { PrivacyTable } from "@/components/PrivacyTable";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEMO_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID || "demo-user-123";

export default function PrivacyPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/archive?user_id=${DEMO_USER_ID}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      );
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch archive:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems();
  }, [page]);

  async function handleView(id: string) {
    const res = await fetch(
      `${API_URL}/api/archive/${id}?user_id=${DEMO_USER_ID}`
    );
    const data = await res.json();
    alert(data.content || "No content available");
  }

  async function handleDelete(id: string) {
    if (!confirm("Permanently delete this item from your archive and Pinecone?")) return;
    await fetch(`${API_URL}/api/archive/${id}?user_id=${DEMO_USER_ID}`, {
      method: "DELETE",
    });
    fetchItems();
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Privacy Center</h1>
        <p className="text-gray-400 text-sm mt-1">
          All data ingested from your Gmail, Slack, and Calendar. View or delete any item.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading archive...</div>
      ) : (
        <>
          <PrivacyTable
            items={items}
            onView={handleView}
            onDelete={handleDelete}
          />
          <div className="flex items-center justify-between mt-6 text-sm text-gray-400">
            <span>{total} total items</span>
            <div className="flex gap-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded border border-gray-700 disabled:opacity-40 hover:border-gray-500 transition-colors"
              >
                Previous
              </button>
              <span className="px-3 py-1">Page {page + 1}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= total}
                className="px-3 py-1 rounded border border-gray-700 disabled:opacity-40 hover:border-gray-500 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
