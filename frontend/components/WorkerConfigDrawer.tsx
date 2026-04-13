"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface WorkerItem {
  id: string;
  worker_key: string;
  name: string;
  description: string;
  status: string;
  security_mode: "vault" | "magic";
  config: {
    monitor_targets?: string;
    auto_draft_replies?: boolean;
    daily_digest_emails?: boolean;
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
  const [dailyDigestEmails, setDailyDigestEmails] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");

  useEffect(() => {
    setMonitorTargets(worker?.config.monitor_targets || "");
    setAutoDraftReplies(Boolean(worker?.config.auto_draft_replies));
    setDailyDigestEmails(Boolean(worker?.config.daily_digest_emails));
    setCustomInstructions(worker?.config.custom_instructions || "");
  }, [worker]);

  async function handleSave() {
    if (!worker) return;
    try {
      await onSave(worker.worker_key, {
        monitor_targets: monitorTargets,
        auto_draft_replies: autoDraftReplies,
        daily_digest_emails: dailyDigestEmails,
        custom_instructions: customInstructions,
      });
    } catch {
      // Error state is surfaced by the directory component.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 grid h-screen w-full max-w-[540px] translate-x-0 translate-y-0 gap-0 border-l border-border bg-white p-0 shadow-none duration-200">
        <DialogHeader className="gap-4 border-b border-neutral-300 px-8 py-8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Worker Configuration
          </div>
          <DialogTitle className="font-sans text-4xl font-extrabold uppercase tracking-[-0.08em] text-black">
            {worker?.name || "Worker"}
          </DialogTitle>
          <DialogDescription className="max-w-md text-sm leading-7 text-neutral-600">
            Set the channels, labels, and operating instructions this worker should follow in the background.
          </DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 content-start gap-8 overflow-y-auto px-8 py-8">
          <div className="grid gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Comma-separated channels or labels to monitor
            </label>
            <Input
              value={monitorTargets}
              onChange={(event) => setMonitorTargets(event.target.value)}
              placeholder="#customers,#exec or vip,inbox"
              className="h-12 rounded-none border-neutral-300 bg-white text-black placeholder:text-neutral-400"
            />
          </div>

          <div className="grid gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Reply mode
            </label>
            <div className="grid grid-cols-2 gap-0 border border-neutral-300">
              <button
                type="button"
                onClick={() => setAutoDraftReplies(false)}
                className={`h-12 text-xs font-semibold uppercase tracking-[0.18em] ${
                  autoDraftReplies ? "bg-white text-black" : "bg-black text-white"
                }`}
              >
                Review required
              </button>
              <button
                type="button"
                onClick={() => setAutoDraftReplies(true)}
                className={`h-12 border-l border-neutral-300 text-xs font-semibold uppercase tracking-[0.18em] ${
                  autoDraftReplies ? "bg-black text-white" : "bg-white text-black"
                }`}
              >
                Auto-draft replies
              </button>
            </div>
          </div>

          <div className="grid gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Daily GTM digest emails
            </label>
            <div className="grid grid-cols-2 gap-0 border border-neutral-300">
              <button
                type="button"
                onClick={() => worker?.security_mode === "magic" && setDailyDigestEmails(true)}
                disabled={worker?.security_mode !== "magic"}
                className={`h-12 text-xs font-semibold uppercase tracking-[0.18em] ${
                  dailyDigestEmails ? "bg-black text-white" : "bg-white text-black"
                } ${worker?.security_mode !== "magic" ? "opacity-40" : ""}`}
              >
                Enabled
              </button>
              <button
                type="button"
                onClick={() => worker?.security_mode === "magic" && setDailyDigestEmails(false)}
                disabled={worker?.security_mode !== "magic"}
                className={`h-12 border-l border-neutral-300 text-xs font-semibold uppercase tracking-[0.18em] ${
                  !dailyDigestEmails ? "bg-black text-white" : "bg-white text-black"
                } ${worker?.security_mode !== "magic" ? "opacity-40" : ""}`}
              >
                Disabled
              </button>
            </div>
            {worker?.security_mode !== "magic" ? (
              <p className="text-xs leading-6 text-neutral-500">
                Daily digest emails are available only in Magic Mode.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
              Custom instructions for this worker
            </label>
            <Textarea
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="Flag only revenue-moving issues, ignore low-signal chatter, and escalate churn risk immediately."
              className="min-h-[220px] rounded-none border-neutral-300 bg-white text-black placeholder:text-neutral-400"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-300 px-8 py-6">
          <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
            {worker?.live_status || "Sleeping"}
          </p>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={!worker || saving}
            className="h-12 rounded-none border-black bg-black px-6 text-white hover:bg-black/90"
          >
            {saving ? "Saving" : "Save Configuration"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
