"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Send, Trash2 } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { extractPIITokens, replacePIITokens, resolvePIITokenValues } from "@/lib/pii";

interface Draft {
  draft_id: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
}

interface LocalDraft {
  id: string;
  channel: string;
  prompt: string;
  draft_text: string;
  created_at: string;
  context_payload?: {
    draft_type?: string;
    stakeholder?: string;
    source?: string;
    agent_name?: string;
    delivery_mode?: string;
    recipient_hint?: string;
    to_email?: string;
  };
}

export function DraftReviewer() {
  const { token, user, privateKey } = useAuth();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [routingDrafts, setRoutingDrafts] = useState<LocalDraft[]>([]);
  const [backendDrafts, setBackendDrafts] = useState<LocalDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [selectedLocalDraft, setSelectedLocalDraft] = useState<LocalDraft | null>(null);
  const [editTo, setEditTo] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [piiMap, setPiiMap] = useState<Record<string, string>>({});
  const [autoOpened, setAutoOpened] = useState(false);

  const fetchDrafts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [gmailDrafts, backendDraftsResponse] = await Promise.all([
        user?.google_connected ? apiFetch("/api/gmail/drafts", { token }) : Promise.resolve([]),
        apiFetch<{ items: LocalDraft[] }>("/api/ops/drafts?limit=12", { token }),
      ]);
      const allBackendDrafts = backendDraftsResponse.items || [];
      setDrafts(gmailDrafts as Draft[]);
      setRoutingDrafts(
        allBackendDrafts.filter((item) => item.context_payload?.draft_type === "CONTEXT_ROUTING"),
      );
      setBackendDrafts(
        allBackendDrafts.filter((item) => item.context_payload?.draft_type !== "CONTEXT_ROUTING"),
      );
    } catch (e: any) {
      if (e.message?.includes("Reconnect Google")) {
        setError("Your Google account session expired. Please reconnect it.");
      } else {
        setError("Failed to load drafts.");
      }
    } finally {
      setLoading(false);
    }
  }, [token, user?.google_connected]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  useEffect(() => {
    if (!token) return;
    const authToken = token;
    let active = true;

    async function loadPII() {
      const allLocalDrafts = [...routingDrafts, ...backendDrafts];
      const unresolved = Array.from(
        new Set(
          allLocalDrafts.flatMap((draft) => [
            ...extractPIITokens(draft.prompt),
            ...extractPIITokens(draft.draft_text),
            ...extractPIITokens(draft.context_payload?.recipient_hint),
            ...extractPIITokens(draft.context_payload?.to_email),
          ]),
        ),
      ).filter((tokenValue) => !(tokenValue in piiMap));

      if (unresolved.length === 0) return;

      try {
        const resolved = await resolvePIITokenValues(unresolved, authToken, privateKey);
        if (active) {
          setPiiMap((current) => ({ ...current, ...resolved }));
        }
      } catch {
        // Keep placeholders visible if private resolution is unavailable.
      }
    }

    void loadPII();
    return () => {
      active = false;
    };
  }, [backendDrafts, piiMap, privateKey, routingDrafts, token]);

  const visibleRoutingDrafts = useMemo(
    () =>
      routingDrafts.map((draft) => ({
        ...draft,
        prompt: replacePIITokens(draft.prompt, piiMap),
        draft_text: replacePIITokens(draft.draft_text, piiMap),
        context_payload: draft.context_payload
          ? {
              ...draft.context_payload,
              stakeholder: replacePIITokens(draft.context_payload.stakeholder, piiMap),
              source: replacePIITokens(draft.context_payload.source, piiMap),
              recipient_hint: replacePIITokens(draft.context_payload.recipient_hint, piiMap),
              to_email: replacePIITokens(draft.context_payload.to_email, piiMap),
            }
          : undefined,
      })),
    [piiMap, routingDrafts],
  );

  const visibleBackendDrafts = useMemo(
    () =>
      backendDrafts.map((draft) => ({
        ...draft,
        prompt: replacePIITokens(draft.prompt, piiMap),
        draft_text: replacePIITokens(draft.draft_text, piiMap),
        context_payload: draft.context_payload
          ? {
              ...draft.context_payload,
              recipient_hint: replacePIITokens(draft.context_payload.recipient_hint, piiMap),
              to_email: replacePIITokens(draft.context_payload.to_email, piiMap),
            }
          : undefined,
      })),
    [backendDrafts, piiMap],
  );

  const pendingCount = drafts.length + visibleRoutingDrafts.length + visibleBackendDrafts.length;

  const openGmailDraft = useCallback((draft: Draft) => {
    setSelectedLocalDraft(null);
    setSelectedDraft(draft);
    setEditTo(draft.to);
    setEditSubject(draft.subject);
    setEditBody(draft.body);
  }, []);

  const openLocalDraft = useCallback((draft: LocalDraft) => {
    setSelectedDraft(null);
    setSelectedLocalDraft(draft);
    setEditTo(draft.context_payload?.to_email || draft.context_payload?.recipient_hint || "");
    setEditSubject(draft.prompt || "Draft reply");
    setEditBody(draft.draft_text);
  }, []);

  useEffect(() => {
    if (loading || autoOpened || error) return;
    if (selectedDraft || selectedLocalDraft) return;

    const firstLocal = visibleRoutingDrafts[0] || visibleBackendDrafts[0];
    if (firstLocal) {
      openLocalDraft(firstLocal);
      setAutoOpened(true);
      return;
    }
    if (drafts[0]) {
      openGmailDraft(drafts[0]);
      setAutoOpened(true);
    }
  }, [
    autoOpened,
    drafts,
    error,
    loading,
    openGmailDraft,
    openLocalDraft,
    selectedDraft,
    selectedLocalDraft,
    visibleBackendDrafts,
    visibleRoutingDrafts,
  ]);

  async function handleSendGmailDraft() {
    if (!selectedDraft || !token) return;
    setIsSending(true);
    try {
      await apiFetch(`/api/gmail/drafts/${selectedDraft.draft_id}/send`, {
        method: "POST",
        token,
        json: { updated_body_html: editBody },
      });
      setDrafts((current) => current.filter((draft) => draft.draft_id !== selectedDraft.draft_id));
      setSelectedDraft(null);
    } catch (e: any) {
      alert(`Error sending draft: ${e.message}`);
    } finally {
      setIsSending(false);
    }
  }

  async function handleDeleteGmailDraft() {
    if (!selectedDraft || !token) return;
    setIsDiscarding(true);
    try {
      await apiFetch(`/api/gmail/drafts/${selectedDraft.draft_id}`, {
        method: "DELETE",
        token,
      });
      setDrafts((current) => current.filter((draft) => draft.draft_id !== selectedDraft.draft_id));
      setSelectedDraft(null);
    } catch (e: any) {
      alert(`Error deleting draft: ${e.message}`);
    } finally {
      setIsDiscarding(false);
    }
  }

  async function handleSendLocalDraft() {
    if (!selectedLocalDraft || !token) return;
    if (!editTo.trim()) {
      alert("Enter a recipient email before sending.");
      return;
    }
    setIsSending(true);
    try {
      await apiFetch(`/api/ops/drafts/${selectedLocalDraft.id}/send`, {
        method: "POST",
        token,
        json: {
          to_email: editTo.trim(),
          subject: editSubject.trim(),
          body: editBody,
        },
      });
      setRoutingDrafts((current) => current.filter((draft) => draft.id !== selectedLocalDraft.id));
      setBackendDrafts((current) => current.filter((draft) => draft.id !== selectedLocalDraft.id));
      setSelectedLocalDraft(null);
    } catch (e: any) {
      alert(`Error sending draft: ${e.message}`);
    } finally {
      setIsSending(false);
    }
  }

  async function handleDiscardLocalDraft() {
    if (!selectedLocalDraft || !token) return;
    setIsDiscarding(true);
    try {
      await apiFetch(`/api/ops/drafts/${selectedLocalDraft.id}/discard`, {
        method: "POST",
        token,
      });
      setRoutingDrafts((current) => current.filter((draft) => draft.id !== selectedLocalDraft.id));
      setBackendDrafts((current) => current.filter((draft) => draft.id !== selectedLocalDraft.id));
      setSelectedLocalDraft(null);
    } catch (e: any) {
      alert(`Error discarding draft: ${e.message}`);
    } finally {
      setIsDiscarding(false);
    }
  }

  function openNextPendingDraft() {
    const firstLocal = visibleRoutingDrafts[0] || visibleBackendDrafts[0];
    if (firstLocal) {
      openLocalDraft(firstLocal);
      return;
    }
    if (drafts[0]) {
      openGmailDraft(drafts[0]);
    }
  }

  return (
    <Card className="col-span-12 mb-8">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="font-bold tracking-tighter">Draft Replies</CardTitle>
          <CardDescription>
            Pending drafts appear automatically when you open the workspace. Send them, bin them, or leave them for later.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <Button variant="outline" size="sm" onClick={openNextPendingDraft}>
              Review Next
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={fetchDrafts} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
        {!loading && pendingCount === 0 && !error ? (
          <p className="mt-4 text-sm text-muted-foreground">No pending drafts.</p>
        ) : null}

        {visibleRoutingDrafts.length > 0 ? (
          <div className="mt-4 space-y-3">
            {visibleRoutingDrafts.map((draft) => (
              <div key={draft.id} className="border border-border px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      Assistant drafted an update to {draft.context_payload?.stakeholder || "stakeholder"} based on recent {draft.context_payload?.source?.toLowerCase() || "activity"}.
                    </p>
                    <p className="mt-2 text-sm leading-7 text-foreground">{draft.draft_text}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openLocalDraft(draft)}>
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {visibleBackendDrafts.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {visibleBackendDrafts.map((draft) => (
              <div key={draft.id} className="border border-border px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      {draft.context_payload?.agent_name || "Assistant"}
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-tight text-foreground">
                      {draft.prompt || "Draft reply"}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-foreground whitespace-pre-line">
                      {draft.draft_text}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openLocalDraft(draft)}>
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {drafts.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {drafts.map((draft) => (
              <Card
                key={draft.draft_id}
                className="cursor-pointer transition-colors hover:border-primary"
                onClick={() => openGmailDraft(draft)}
              >
                <CardHeader className="border-b bg-muted/40 p-4 pb-3">
                  <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    To: {draft.to}
                  </p>
                  <CardTitle className="text-sm font-bold tracking-tight line-clamp-1">
                    {draft.subject || "(No Subject)"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground line-clamp-3">{draft.snippet}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </CardContent>

      <Dialog
        open={Boolean(selectedDraft || selectedLocalDraft)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDraft(null);
            setSelectedLocalDraft(null);
          }
        }}
      >
        {selectedLocalDraft ? (
          <DialogContent className="sm:max-w-[760px] gap-6">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-xl font-bold tracking-tighter">Draft Inbox</DialogTitle>
              <DialogDescription>
                Review and explicitly send this encrypted draft from your workspace.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To</span>
              <Input value={editTo} onChange={(event) => setEditTo(event.target.value)} placeholder="recipient@company.com" />
            </div>
            <div className="grid gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subject</span>
              <Input value={editSubject} onChange={(event) => setEditSubject(event.target.value)} />
            </div>
            <div className="grid gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Message Body</span>
              <Textarea
                className="min-h-[280px] resize-y text-sm leading-relaxed"
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
              />
            </div>
            {!user?.google_connected ? (
              <p className="text-sm text-muted-foreground">
                Connect Google before sending. You can still leave this draft for later or bin it.
              </p>
            ) : null}
            <div className="flex flex-col justify-between gap-3 border-t border-border pt-4 sm:flex-row">
              <Button variant="outline" onClick={handleDiscardLocalDraft} disabled={isDiscarding}>
                {isDiscarding ? "Binning..." : "Bin"} <Trash2 className="ml-2 h-4 w-4" />
              </Button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="ghost" onClick={() => setSelectedLocalDraft(null)}>
                  Later
                </Button>
                <Button onClick={handleSendLocalDraft} disabled={isSending || !user?.google_connected}>
                  {isSending ? "Sending..." : "Send"} <Send className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}

        {selectedDraft ? (
          <DialogContent className="sm:max-w-[700px] gap-6">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-xl font-bold tracking-tighter">Gmail Draft</DialogTitle>
              <div className="divide-y divide-border border border-border text-sm">
                <div className="flex gap-2 bg-muted/20 p-3">
                  <span className="w-16 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To</span>
                  <span className="font-medium text-foreground">{selectedDraft.to}</span>
                </div>
                <div className="flex gap-2 bg-muted/20 p-3">
                  <span className="w-16 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subject</span>
                  <span className="font-medium text-foreground">{selectedDraft.subject}</span>
                </div>
              </div>
            </DialogHeader>
            <div className="grid gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Message Body (HTML)</span>
              <Textarea
                className="min-h-[250px] resize-y font-mono text-sm leading-relaxed"
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
              />
            </div>
            <div className="flex flex-col justify-between gap-3 border-t border-border pt-4 sm:flex-row">
              <Button variant="outline" onClick={handleDeleteGmailDraft} disabled={isDiscarding}>
                {isDiscarding ? "Binning..." : "Bin"} <Trash2 className="ml-2 h-4 w-4" />
              </Button>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => window.open("https://mail.google.com/mail/u/0/#drafts", "_blank")}
                >
                  Review in Gmail <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="ghost" onClick={() => setSelectedDraft(null)}>
                  Later
                </Button>
                <Button onClick={handleSendGmailDraft} disabled={isSending}>
                  {isSending ? "Sending..." : "Send"} <Send className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}
