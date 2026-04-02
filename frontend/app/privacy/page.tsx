"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Database, Eye, LockKeyhole, Shield } from "lucide-react";

import { PrivacyTable } from "@/components/PrivacyTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";

interface ArchiveItem {
  id: string;
  source: string;
  context_tags: string[];
  ingested_at: string;
}

export default function PrivacyPage() {
  const { ready, token } = useRequireAuth();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewContent, setViewContent] = useState("");
  const [viewItem, setViewItem] = useState<ArchiveItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ArchiveItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const PAGE_SIZE = 20;

  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ items: ArchiveItem[]; total: number }>(
        `/api/archive?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        {
          token,
        }
      );
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, token]);

  useEffect(() => {
    if (ready) {
      void fetchItems();
    }
  }, [fetchItems, ready]);

  async function handleView(item: ArchiveItem) {
    if (!token) return;
    setNotice(null);
    setViewItem(item);
    setViewContent("");
    setViewOpen(true);
    setViewLoading(true);

    try {
      const data = await apiFetch<{ content?: string }>(`/api/archive/${item.id}`, {
        token,
      });
      setViewContent(data.content || "No content available");
    } catch {
      setViewContent("Unable to load decrypted content.");
    } finally {
      setViewLoading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !token) return;

    setDeleting(true);
    try {
      await apiFetch(`/api/archive/${deleteTarget.id}`, {
        method: "DELETE",
        token,
      });
      setNotice("Archive item deleted.");
      setDeleteTarget(null);
      await fetchItems();
    } finally {
      setDeleting(false);
    }
  }

  const hasNextPage = page + 1 < Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!ready) {
    return (
      <Card>
        <CardContent className="py-20 text-center text-sm text-zinc-500">
          Loading privacy center...
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]"
        >
          <Card>
            <CardHeader>
              <Badge className="w-fit">Privacy Center</Badge>
              <CardTitle className="text-4xl">
                Inspect what the system kept.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Review archived entries, open the decrypted original when needed, and forget records permanently from the archive surface.
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="grid gap-4">
            {[
              { label: "Visible Records", value: items.length, icon: Database },
              { label: "Current Page", value: page + 1, icon: Eye },
              {
                label: "Protected Mode",
                value: total > 0 ? total : "On",
                icon: LockKeyhole,
              },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div>
                    <p className="mono-label mb-2">{label}</p>
                    <p className="text-4xl font-semibold tracking-[-0.05em] text-white">
                      {value}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                    <Icon className="h-4 w-4 text-zinc-100" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.section>

        {notice ? (
          <Card className="border-white/15">
            <CardContent className="pt-6 text-sm text-zinc-300">{notice}</CardContent>
          </Card>
        ) : null}

        {loading ? (
          <Card>
            <CardContent className="py-20 text-center text-sm text-zinc-500">
              Loading archive...
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden">
              <PrivacyTable
                items={items}
                onView={handleView}
                onDelete={(item) => {
                  setNotice(null);
                  setDeleteTarget(item);
                }}
              />
            </Card>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-500">
                Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                  disabled={page === 0}
                >
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                  disabled={!hasNextPage}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Decrypted archive entry</DialogTitle>
            <DialogDescription>
              {viewItem
                ? `${viewItem.source} • ${new Date(viewItem.ingested_at).toLocaleString()}`
                : "Loading entry"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-[24px] border border-white/10 bg-black/40 p-4">
            {viewLoading ? (
              <div className="flex items-center gap-3 text-sm text-zinc-400">
                <Shield className="h-4 w-4" />
                Loading decrypted content...
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-zinc-300">
                {viewContent}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forget archive item</DialogTitle>
            <DialogDescription>
              This removes the selected entry from the archive surface. Use it when a record should no longer be retained.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={deleting}>
              {deleting ? "Forgetting..." : "Forget Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
