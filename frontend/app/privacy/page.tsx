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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import {
  decryptArchiveContent,
  decryptPIIMapping,
  deriveMasterKey,
  unwrapPrivateKey,
} from "@/lib/crypto";
import { useRequireAuth } from "@/lib/use-require-auth";

interface ArchiveItem {
  id: string;
  source: string;
  context_tags: string[];
  ingested_at: string;
}

interface ArchiveViewResponse {
  content?: string;
  content_enc?: string;
  content_encryption_scheme?: string;
  content_redacted?: string;
  pii_tokens?: string[];
  pii_mapping_enc?: Record<string, string>;
  pii_mapping_scheme?: Record<string, string>;
}

export default function PrivacyPage() {
  const { ready, token, privateKey, setPrivateKey } = useRequireAuth();
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewContent, setViewContent] = useState("");
  const [piiTokens, setPiiTokens] = useState<string[]>([]);
  const [viewItem, setViewItem] = useState<ArchiveItem | null>(null);
  const [viewRequiresUnlock, setViewRequiresUnlock] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ArchiveItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
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
    setViewOpen(true);
    setViewLoading(true);
    setViewRequiresUnlock(false);

    try {
      const data = await apiFetch<ArchiveViewResponse>(`/api/archive/${item.id}`, {
        token,
      });
      const redactedContent = data.content_redacted || data.content || "No content available";
      setViewContent(redactedContent);
      const contentEncryptionScheme = data.content_encryption_scheme || "fernet";
      const scheme = data.pii_mapping_scheme || {};
      const encrypted = data.pii_mapping_enc || {};
      const rsaMapping: Record<string, string> = Object.fromEntries(
        Object.entries(encrypted).filter(([tokenKey]) => scheme[tokenKey] === "rsa_oaep")
      );

      if (contentEncryptionScheme === "rsa_aes_gcm" && data.content_enc) {
        if (!privateKey) {
          setViewRequiresUnlock(true);
          setNotice("Unlock the encrypted workspace to see original archived content.");
          setPiiTokens(data.pii_tokens || []);
          return;
        }
        setViewContent(await decryptArchiveContent(data.content_enc, privateKey));
      } else if (Object.keys(rsaMapping).length > 0) {
        if (!privateKey) {
          setViewRequiresUnlock(true);
          setNotice("Unlock the encrypted workspace to restore private names in this archive entry.");
          setPiiTokens(data.pii_tokens || []);
          return;
        }
        const decryptedMapping = await decryptPIIMapping(rsaMapping, privateKey);
        let reconstructed = redactedContent;
        for (const [tokenKey, plainValue] of Object.entries(decryptedMapping)) {
          reconstructed = reconstructed.replaceAll(tokenKey, plainValue);
        }
        setViewContent(reconstructed);
      } else {
        // Legacy rows are still decrypted server-side when only Fernet exists.
        setViewContent(data.content || redactedContent);
      }
      setPiiTokens(data.pii_tokens || []);
    } catch (err) {
      setViewContent((current) => current || "Unable to load archived content.");
      if (err instanceof Error) {
        setNotice(err.message);
      }
    } finally {
      setViewLoading(false);
    }
  }

  async function handleUnlockWorkspace() {
    if (!token) return;
    setUnlocking(true);
    setNotice(null);
    try {
      const data = await apiFetch<{
        salt: string;
        encrypted_private_key: string;
      }>("/api/auth/key-material", { token });
      const masterKey = await deriveMasterKey(unlockPassword, data.salt);
      const restoredPrivateKey = await unwrapPrivateKey(
        data.encrypted_private_key,
        masterKey
      );
      setPrivateKey(restoredPrivateKey);
      setUnlockOpen(false);
      setUnlockPassword("");
      setNotice("Encrypted workspace unlocked in this session.");
      if (viewItem) {
        await handleView(viewItem);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to unlock encrypted workspace.");
    } finally {
      setUnlocking(false);
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
          <Card className="panel-pro">
            <CardHeader>
              <Badge className="w-fit">Privacy Center</Badge>
              <CardTitle className="text-4xl">
                Inspect what the system kept.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Review archived entries, decrypt original content locally in the browser, and remove records permanently from the archive surface.
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
              <Card key={label} className="panel-pro">
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
            <Card className="panel-pro overflow-hidden">
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
        <DialogContent className="max-w-3xl rounded-[1.5rem] border border-border/70 bg-card/95 p-8">
          <DialogHeader>
            <DialogTitle>Archive entry</DialogTitle>
            <DialogDescription>
              {viewItem
                ? `${viewItem.source} • ${new Date(viewItem.ingested_at).toLocaleString()}`
                : "Loading entry"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <span className="live-dot" />
              Client-decrypted view
            </div>
            <div className="flex items-center gap-3">
              {viewRequiresUnlock ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUnlockOpen(true)}
                >
                  Unlock Workspace
                </Button>
              ) : null}
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                If placeholders remain, the stored source content was already sanitized before archival.
              </p>
            </div>
          </div>
          {viewRequiresUnlock ? (
            <Alert variant="info">
              <AlertTitle>Workspace locked</AlertTitle>
              <AlertDescription>
                Showing the redacted archive copy. Unlock the encrypted workspace in this session to view original private content.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="max-h-[60vh] overflow-y-auto rounded-[1.2rem] border border-border/70 bg-background p-5 shadow-inner">
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

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock encrypted workspace</DialogTitle>
            <DialogDescription>
              Enter your account password to derive the vault key locally and decrypt archived content in this browser session.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Label htmlFor="workspace-password">Password</Label>
            <Input
              id="workspace-password"
              type="password"
              value={unlockPassword}
              onChange={(event) => setUnlockPassword(event.target.value)}
              placeholder="Enter your password"
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setUnlockOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleUnlockWorkspace()} disabled={unlocking || !unlockPassword}>
              {unlocking ? "Unlocking..." : "Unlock"}
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
