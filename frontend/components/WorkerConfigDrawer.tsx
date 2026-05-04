"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface WorkerItem {
  id: string;
  worker_key: string;
  name: string;
  description: string;
  status: string;
  security_mode: "vault";
  config: {
    monitor_targets?: string;
    auto_draft_replies?: boolean;
    custom_instructions?: string;
  };
  live_status: string;
  updated_at?: string | null;
}

interface WorkerConfigDrawerProps {
  open: boolean;
  worker: WorkerItem | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (workerKey: string, config: WorkerItem["config"]) => Promise<void>;
}

export function WorkerConfigDrawer({
  open,
  worker,
  saving,
  onOpenChange,
  onSave,
}: WorkerConfigDrawerProps) {
  const [monitorTargets, setMonitorTargets] = useState("");
  const [autoDraftReplies, setAutoDraftReplies] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");

  useEffect(() => {
    setMonitorTargets(worker?.config.monitor_targets || "");
    setAutoDraftReplies(Boolean(worker?.config.auto_draft_replies));
    setCustomInstructions(worker?.config.custom_instructions || "");
  }, [worker]);

  async function handleSave() {
    if (!worker) return;
    try {
      await onSave(worker.worker_key, {
        monitor_targets: monitorTargets,
        auto_draft_replies: autoDraftReplies,
        custom_instructions: customInstructions,
      });
    } catch {
      // Error state is surfaced by the directory component.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-screen w-full max-w-[520px] translate-x-0 translate-y-0 gap-0 border-l border-border bg-card p-0 shadow-2xl sm:max-w-[520px] flex flex-col rounded-none">
        <DialogHeader className="border-b border-border px-6 py-5">
          <Badge variant="outline" className="w-fit mb-2">Worker Configuration</Badge>
          <DialogTitle className="text-2xl font-black uppercase tracking-tight text-foreground">
            {worker?.name || "Worker"}
          </DialogTitle>
          <p className="text-sm text-foreground/60">
            Set the channels, labels, and operating instructions this worker should follow before surfacing founder-reviewed content.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
              Monitor targets
            </Label>
            <p className="text-xs text-foreground/50">Comma-separated channels or labels to monitor</p>
            <Input
              value={monitorTargets}
              onChange={(event) => setMonitorTargets(event.target.value)}
              placeholder="#hiring,#recruiting,#candidates"
              className="h-11 border-border bg-background text-foreground placeholder:text-foreground/40"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
              Reply mode
            </Label>
            <div className="grid grid-cols-2 border border-border">
              <button
                type="button"
                onClick={() => setAutoDraftReplies(false)}
                className={`flex items-center justify-center h-11 text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
                  !autoDraftReplies
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground/60 hover:bg-accent"
                }`}
              >
                Review required
              </button>
              <button
                type="button"
                onClick={() => setAutoDraftReplies(true)}
                className={`flex items-center justify-center h-11 text-xs font-bold uppercase tracking-[0.12em] border-l border-border transition-colors ${
                  autoDraftReplies
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground/60 hover:bg-accent"
                }`}
              >
                Auto-draft replies
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
              Custom instructions
            </Label>
            <p className="text-xs text-foreground/50">Operating context and priorities for this worker</p>
            <Textarea
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="Focus on candidate experience, interview scheduling, and offer follow-ups. Flag delayed hiring pipelines."
              className="min-h-[180px] border-border bg-background text-foreground placeholder:text-foreground/40 resize-none"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">Worker status</p>
                <p className="mt-1 text-lg font-black text-foreground">{worker?.live_status || "Sleeping"}</p>
              </div>
              <div
                className={`h-3 w-3 rounded-full ${
                  worker?.live_status === "Active" || worker?.live_status === "Processing"
                    ? "bg-green-500 animate-pulse"
                    : worker?.live_status === "Paused"
                      ? "bg-yellow-500"
                      : "bg-foreground/30"
                }`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-foreground/60"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!worker || saving}
          >
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}