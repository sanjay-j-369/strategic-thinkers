"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Database, Eye, LockKeyhole, Shield } from "lucide-react";

import { PrivacyTable } from "@/components/PrivacyTable";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";

interface ArchiveItem {
  id: string;
  source: string;
  context_tags: string[];
  ingested_at: string;
}

interface ArchiveViewResponse {
  content?: string;
  content_redacted?: string;
  pii_tokens?: string[];
  pii_mapping_enc?: Record<string, string>;
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
  const [piiTokens, setPiiTokens] = useState<string[]>([]);
  const [piiMappingEnc, setPiiMappingEnc] = useState<Record<string, string>>({});
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
    setPiiTokens([]);
    setPiiMappingEnc({});
    setViewOpen(true);
    setViewLoading(true);

    try {
      const data = await apiFetch<ArchiveViewResponse>(`/api/archive/${item.id}`, {
        token,
      });
      setViewContent(data.content || data.content_redacted || "No content available");
      setPiiTokens(data.pii_tokens || []);
      setPiiMappingEnc(data.pii_mapping_enc || {});
    } catch {
      setViewContent("Unable to load archived content.");
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
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
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
                Review archived entries, inspect redacted content with token placeholders, and forget records permanently from the archive surface.
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
                    <p className="text-4xl font-semibold tracking-[-0.05em] text-foreground">
                      {value}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400">
                    <Icon className="h-4 w-4 text-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.section>

        {notice ? (
          <Alert variant="info">
            <AlertTitle>Archive updated</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <Skeleton className="h-64 w-full" />
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
              <div className="text-sm text-muted-foreground">
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Archive entry</DialogTitle>
            <DialogDescription>
              {viewItem
                ? `${viewItem.source} • ${new Date(viewItem.ingested_at).toLocaleString()}`
                : "Loading entry"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Original view
            </p>
          </div>
          <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-card p-4">
            {viewLoading ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Shield className="h-4 w-4" />
                Loading archived content...
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-muted-foreground">
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
