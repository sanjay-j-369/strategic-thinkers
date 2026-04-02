"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Inbox, Mail, MessageSquare, Shield, Sparkles } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const DEMO_USER_ID = "d4c615b8-cedc-4c97-80ed-2c8373610d78";

type Tab = "email" | "slack";

export default function IngestPage() {
  const [tab, setTab] = useState<Tab>("email");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState<string | null>(null);

  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const [slackChannel, setSlackChannel] = useState("");
  const [slackMessage, setSlackMessage] = useState("");

  const allowManual =
    process.env.NEXT_PUBLIC_ALLOW_MANUAL_INGESTION === "true" ||
    process.env.NEXT_PUBLIC_INGESTION_MODE === "simulate";

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccess(null);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/ingest/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          from_address: emailFrom,
          subject: emailSubject,
          body: emailBody,
        }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setSuccess("Email ingested. Check the feed for the processed card.");
      setEmailFrom("");
      setEmailSubject("");
      setEmailBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function submitSlack(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccess(null);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/ingest/slack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          channel: slackChannel,
          message: slackMessage,
        }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setSuccess("Slack message ingested. Check the feed for the update.");
      setSlackChannel("");
      setSlackMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  if (!allowManual) {
    return (
      <>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <Badge className="w-fit">Data Integrations</Badge>
              <CardTitle className="text-4xl">Connect your operating surface.</CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Plug in Google and Slack to stream context continuously, or wait for manual ingestion to stay enabled in simulate mode.
              </CardDescription>
            </CardHeader>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                key: "google",
                title: "Google Mail and Calendar",
                description:
                  "Automatically ingest email context and keep meeting prep in sync.",
                icon: Mail,
              },
              {
                key: "slack",
                title: "Slack",
                description:
                  "Listen for updates in important channels without manual copy and paste.",
                icon: MessageSquare,
              },
            ].map(({ key, title, description, icon: Icon }) => (
              <Card
                key={key}
                className="transition-transform duration-200 hover:-translate-y-0.5"
              >
                <CardContent className="flex h-full flex-col justify-between gap-8 pt-6">
                  <div className="space-y-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                      <Icon className="h-5 w-5 text-zinc-100" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xl font-semibold text-white">{title}</h2>
                      <p className="text-sm leading-7 text-zinc-400">{description}</p>
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => setComingSoon(title)}>
                    Request Access
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {success ? (
            <Card className="border-white/15">
              <CardContent className="pt-6 text-sm text-zinc-300">{success}</CardContent>
            </Card>
          ) : null}
        </div>

        <Dialog
          open={Boolean(comingSoon)}
          onOpenChange={(open) => !open && setComingSoon(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{comingSoon}</DialogTitle>
              <DialogDescription>
                The integration flow is not wired yet. This screen is now styled and ready for the actual OAuth handshake when the backend is available.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setComingSoon(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <Card>
          <CardHeader>
            <Badge className="w-fit">Manual Ingestion</Badge>
            <CardTitle className="text-4xl">
              Drop in raw context, keep the UI clean.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base">
              Paste email or Slack content and the pipeline will redact PII, encrypt content, and route the useful parts into the feed.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="inline-flex rounded-full border border-white/10 bg-black/30 p-1">
              {(["email", "slack"] as Tab[]).map((currentTab) => {
                const active = tab === currentTab;

                return (
                  <Button
                    key={currentTab}
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    onClick={() => {
                      setTab(currentTab);
                      setSuccess(null);
                      setError(null);
                    }}
                    className="min-w-[120px]"
                  >
                    {currentTab === "email" ? (
                      <Mail className="h-4 w-4" />
                    ) : (
                      <MessageSquare className="h-4 w-4" />
                    )}
                    {currentTab === "email" ? "Email" : "Slack"}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card>
            <CardContent className="pt-6">
              {tab === "email" ? (
                <form onSubmit={submitEmail} className="space-y-5">
                  <div className="space-y-2">
                    <label className="mono-label">From</label>
                    <Input
                      type="email"
                      value={emailFrom}
                      onChange={(e) => setEmailFrom(e.target.value)}
                      placeholder="investor@vc-firm.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="mono-label">Subject</label>
                    <Input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Re: Q2 roadmap review"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="mono-label">Body</label>
                    <Textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      placeholder="Paste the email body here..."
                      required
                      rows={8}
                    />
                  </div>
                  <SubmitButton loading={loading} label="Ingest Email" />
                </form>
              ) : (
                <form onSubmit={submitSlack} className="space-y-5">
                  <div className="space-y-2">
                    <label className="mono-label">Channel</label>
                    <Input
                      type="text"
                      value={slackChannel}
                      onChange={(e) => setSlackChannel(e.target.value)}
                      placeholder="engineering"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="mono-label">Message</label>
                    <Textarea
                      value={slackMessage}
                      onChange={(e) => setSlackMessage(e.target.value)}
                      placeholder="Paste the Slack message here..."
                      required
                      rows={8}
                    />
                  </div>
                  <SubmitButton loading={loading} label="Ingest Message" />
                </form>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {success ? (
          <Card className="border-white/15">
            <CardContent className="pt-6 text-sm text-zinc-300">{success}</CardContent>
          </Card>
        ) : null}
        {error ? (
          <Card className="border-white/15">
            <CardContent className="pt-6 text-sm text-zinc-400">{error}</CardContent>
          </Card>
        ) : null}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="h-full">
          <CardHeader>
            <Badge variant="secondary" className="w-fit">
              Processing Path
            </Badge>
            <CardTitle className="text-2xl">
              Everything stays monochrome and traceable.
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                icon: Inbox,
                title: "Capture",
                body: "Paste raw context from email or Slack with minimal formatting overhead.",
              },
              {
                icon: Shield,
                title: "Protect",
                body: "PII is redacted and encrypted before the original content is archived.",
              },
              {
                icon: Sparkles,
                title: "Surface",
                body: "Relevant context is embedded and pushed into the feed for quick review.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-[24px] border border-white/10 bg-black/30 p-4"
              >
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                  <Icon className="h-4 w-4 text-zinc-100" />
                </div>
                <p className="mono-label mb-2">{title}</p>
                <p className="text-sm leading-7 text-zinc-400">{body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function SubmitButton({
  loading,
  label,
}: {
  loading: boolean;
  label: string;
}) {
  return (
    <Button type="submit" disabled={loading} size="lg" className="w-full">
      {loading ? "Processing..." : label}
    </Button>
  );
}
