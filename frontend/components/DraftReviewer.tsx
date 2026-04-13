"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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
  };
}

export function DraftReviewer() {
  const { token, user } = useAuth();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [routingDrafts, setRoutingDrafts] = useState<LocalDraft[]>([]);
  const [backendDrafts, setBackendDrafts] = useState<LocalDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [editBody, setEditBody] = useState("");
  const [isSending, setIsSending] = useState(false);

  const fetchDrafts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [gmailDrafts, backendDrafts] = await Promise.all([
        user?.google_connected ? apiFetch("/api/gmail/drafts", { token }) : Promise.resolve([]),
        apiFetch<{ items: LocalDraft[] }>("/api/ops/drafts?limit=12", { token }),
      ]);
      const allBackendDrafts = backendDrafts.items || [];
      setDrafts(gmailDrafts as Draft[]);
      setRoutingDrafts(
        allBackendDrafts.filter((item) => item.context_payload?.draft_type === "CONTEXT_ROUTING"),
      );
      setBackendDrafts(
        allBackendDrafts.filter((item) => item.context_payload?.draft_type !== "CONTEXT_ROUTING"),
      );
    } catch (e: any) {
      if (e.message?.includes("Reconnect Google")) {
        setError("Your Google Account session expired. Please reconnect it.");
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

  const openDraft = (d: Draft) => {
    setSelectedDraft(d);
    setEditBody(d.body);
  };

  const handleSend = async () => {
    if (!selectedDraft || !token) return;
    setIsSending(true);
    try {
      await apiFetch(`/api/gmail/drafts/${selectedDraft.draft_id}/send`, {
        method: "POST",
        token,
        json: { updated_body_html: editBody },
      });
      // Success, remove draft
      setDrafts((prev) => prev.filter((x) => x.draft_id !== selectedDraft.draft_id));
      setSelectedDraft(null);
    } catch (e: any) {
      alert("Error sending draft: " + e.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="col-span-12 md:col-span-12 lg:col-span-12 mb-8">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="font-bold tracking-tighter mix-blend-difference">Draft Replies</CardTitle>
          <CardDescription>Review AI-generated drafts, including context routing tasks.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDrafts} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        {!loading && drafts.length === 0 && routingDrafts.length === 0 && backendDrafts.length === 0 && !error && (
          <p className="text-sm text-muted-foreground mt-4">No pending drafts.</p>
        )}

        {routingDrafts.length > 0 ? (
          <div className="mt-4 space-y-3">
            {routingDrafts.map((draft) => (
              <div key={draft.id} className="border border-border px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                  Assistant drafted an update to {draft.context_payload?.stakeholder || "stakeholder"} based on recent {draft.context_payload?.source?.toLowerCase() || "activity"}.
                </p>
                <p className="mt-2 text-sm leading-7 text-foreground">{draft.draft_text}</p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {draft.context_payload?.delivery_mode === "vault_pending" ? "Waiting for founder sync" : "Native draft path prepared"}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {backendDrafts.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {backendDrafts.map((draft) => (
              <div key={draft.id} className="border border-border px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      {draft.context_payload?.agent_name || "Assistant"}
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-tight text-foreground">
                      {draft.prompt || "Draft reply"}
                    </p>
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {draft.channel}
                  </p>
                </div>
                <p className="mt-3 text-sm leading-7 text-foreground whitespace-pre-line">
                  {draft.draft_text}
                </p>
                <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  {draft.context_payload?.delivery_mode === "vault_pending"
                    ? "Waiting for founder sync"
                    : draft.context_payload?.delivery_mode === "gmail_native"
                      ? "Native Gmail draft created"
                      : draft.context_payload?.delivery_mode === "magic_pending"
                        ? "Ready for background delivery"
                        : "Stored as pending draft"}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {drafts.map((d) => (
            <Card key={d.draft_id} className="cursor-pointer hover:border-primary transition-colors flex flex-col overflow-hidden" onClick={() => openDraft(d)}>
              <CardHeader className="p-4 bg-muted/40 border-b pb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate mb-1">To: {d.to}</p>
                <CardTitle className="text-sm font-bold tracking-tight line-clamp-1">{d.subject || "(No Subject)"}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex-1">
                <p className="text-xs text-muted-foreground line-clamp-3">{d.snippet}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>

      <Dialog open={!!selectedDraft} onOpenChange={(o) => (!o ? setSelectedDraft(null) : null)}>
        {selectedDraft && (
          <DialogContent className="sm:max-w-[700px] gap-6">
            <DialogHeader className="space-y-3">
              <DialogTitle className="font-bold tracking-tighter text-xl">Review Draft</DialogTitle>
              <div className="border border-border rounded-md divide-y divide-border text-sm">
                <div className="p-3 bg-muted/20 flex gap-2">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground w-16 pt-0.5">To</span>
                  <span className="font-medium text-foreground">{selectedDraft.to}</span>
                </div>
                <div className="p-3 bg-muted/20 flex gap-2">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground w-16 pt-0.5">Subject</span>
                  <span className="font-medium text-foreground">{selectedDraft.subject}</span>
                </div>
              </div>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Message Body (HTML)</span>
              <Textarea 
                className="min-h-[250px] resize-y font-mono text-sm leading-relaxed" 
                value={editBody} 
                onChange={(e) => setEditBody(e.target.value)} 
              />
            </div>
            <div className="flex flex-col sm:flex-row justify-between gap-3 mt-2 pt-4 border-t border-border">
              <Button 
                variant="outline" 
                className="font-bold tracking-tight"
                onClick={() => window.open("https://mail.google.com/mail/u/0/#drafts", "_blank")}
              >
                Review in Gmail <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="ghost" onClick={() => setSelectedDraft(null)} className="font-bold tracking-tight">Cancel</Button>
                <Button onClick={handleSend} disabled={isSending} className="font-bold tracking-tight">
                  {isSending ? "Sending..." : "Send Reply"} <Send className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
