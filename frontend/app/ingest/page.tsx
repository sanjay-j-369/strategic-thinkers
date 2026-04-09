"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarSync,
  Inbox,
  Mail,
  MessageSquare,
  Shield,
  Sparkles,
  Unplug,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";

type Tab = "email" | "slack";
type Provider = "google" | "slack";

interface IntegrationStatus {
  google: {
    connected: boolean;
    last_synced_at: string | null;
  };
  slack: {
    connected: boolean;
    team_id: string | null;
    channel_ids: string[];
    last_synced_at: string | null;
  };
}

const DEFAULT_INTEGRATIONS: IntegrationStatus = {
  google: {
    connected: false,
    last_synced_at: null,
  },
  slack: {
    connected: false,
    team_id: null,
    channel_ids: [],
    last_synced_at: null,
  },
};

export default function IngestPage() {
  const router = useRouter();
  const { ready, token, user, refreshSession } = useRequireAuth();

  const [tab, setTab] = useState<Tab>("email");
  const [submittingManual, setSubmittingManual] = useState(false);
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [integrations, setIntegrations] =
    useState<IntegrationStatus>(DEFAULT_INTEGRATIONS);
  const [integrationsLoading, setIntegrationsLoading] = useState(true);

  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const [slackChannel, setSlackChannel] = useState("");
  const [slackMessage, setSlackMessage] = useState("");

  const allowManual =
    process.env.NEXT_PUBLIC_ALLOW_MANUAL_INGESTION === "true" ||
    process.env.NEXT_PUBLIC_INGESTION_MODE === "simulate";

  const refreshIntegrations = useCallback(async () => {
    if (!token) return;
    setIntegrationsLoading(true);
    try {
      const data = await apiFetch<IntegrationStatus>("/api/auth/integrations", {
        token,
      });
      setIntegrations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load integrations.");
    } finally {
      setIntegrationsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) {
      void refreshIntegrations();
    }
  }, [ready, refreshIntegrations]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const integration = params.get("integration");
    const status = params.get("status");
    const message = params.get("message");
    if (!integration || !status) return;

    if (status === "connected") {
      setSuccess(
        `${integration === "google" ? "Google" : "Slack"} connected successfully.`
      );
      setError(null);
      void refreshIntegrations();
      void refreshSession();
    } else {
      setError(
        message ||
          `${integration === "google" ? "Google" : "Slack"} connection failed.`
      );
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("integration");
    url.searchParams.delete("status");
    url.searchParams.delete("message");
    router.replace(url.pathname + url.search);
  }, [refreshIntegrations, refreshSession, router]);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmittingManual(true);
    setSuccess(null);
    setError(null);

    try {
      await apiFetch("/api/ingest/email", {
        method: "POST",
        token,
        json: {
          from_address: emailFrom,
          subject: emailSubject,
          body: emailBody,
        },
      });
      setSuccess("Email ingested. Check the feed for the processed card.");
      setEmailFrom("");
      setEmailSubject("");
      setEmailBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setSubmittingManual(false);
    }
  }

  async function submitSlack(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmittingManual(true);
    setSuccess(null);
    setError(null);

    try {
      await apiFetch("/api/ingest/slack", {
        method: "POST",
        token,
        json: {
          channel: slackChannel,
          message: slackMessage,
        },
      });
      setSuccess("Slack message ingested. Check the feed for the update.");
      setSlackChannel("");
      setSlackMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setSubmittingManual(false);
    }
  }

  async function startOAuth(provider: Provider) {
    if (!token) return;
    setBusyProvider(provider);
    setSuccess(null);
    setError(null);

    try {
      const data = await apiFetch<{ auth_url: string }>(
        `/api/auth/${provider}/start`,
        {
          method: "POST",
          token,
          json: { return_to: "/ingest" },
        }
      );
      window.location.assign(data.auth_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
      setBusyProvider(null);
    }
  }

  async function disconnectProvider(provider: Provider) {
    if (!token) return;
    setBusyProvider(provider);
    setSuccess(null);
    setError(null);

    try {
      await apiFetch(`/api/auth/${provider}/disconnect`, {
        method: "DELETE",
        token,
      });
      setSuccess(
        `${provider === "google" ? "Google" : "Slack"} disconnected successfully.`
      );
      await refreshIntegrations();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed.");
    } finally {
      setBusyProvider(null);
    }
  }

  async function syncProvider(provider: Provider) {
    if (!token) return;
    setBusyProvider(provider);
    setSuccess(null);
    setError(null);

    try {
      if (provider === "google") {
        const data = await apiFetch<{
          gmail_events: number;
          calendar_events: number;
          prep_cards: number;
        }>("/api/auth/google/sync", {
          method: "POST",
          token,
        });
        setSuccess(
          `Google synced. ${data.gmail_events} email events, ${data.calendar_events} calendar meetings, ${data.prep_cards} prep cards queued.`
        );
      } else {
        const data = await apiFetch<{
          channels: string[];
          messages: number;
        }>("/api/auth/slack/sync", {
          method: "POST",
          token,
        });
        setSuccess(
          `Slack synced. ${data.messages} messages pulled from ${data.channels.length} channels.`
        );
      }
      await refreshIntegrations();
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setBusyProvider(null);
    }
  }

  if (!ready) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]"
      >
        <Card>
          <CardHeader>
            <Badge className="w-fit">Connected Sources</Badge>
            <CardTitle className="text-4xl">
              Sync context instead of pasting it by hand.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base">
              Connect Google and Slack for {user?.email}. Pull fresh meetings, email, and channel context into the feed, then use manual ingestion only as fallback.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Badge variant="secondary" className="w-fit">
              Account
            </Badge>
            <CardTitle className="text-2xl">{user?.full_name || user?.email}</CardTitle>
            <CardDescription>
              Google connected: {integrations.google.connected ? "Yes" : "No"}.
              Slack connected: {integrations.slack.connected ? "Yes" : "No"}.
            </CardDescription>
          </CardHeader>
        </Card>
      </motion.section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <IntegrationCard
              title="Google Mail and Calendar"
              description="Connect once, then sync recent Gmail and upcoming Google Calendar events into your feed and meetings view."
              icon={Mail}
              connected={integrations.google.connected}
              lastSyncedAt={integrations.google.last_synced_at}
              loading={integrationsLoading || busyProvider === "google"}
              onConnect={() => startOAuth("google")}
              onSync={() => syncProvider("google")}
              onDisconnect={() => disconnectProvider("google")}
            />

            <IntegrationCard
              title="Slack"
              description="Connect your workspace and sync recent channel messages so the feed can update without manual copy and paste."
              icon={MessageSquare}
              connected={integrations.slack.connected}
              lastSyncedAt={integrations.slack.last_synced_at}
              loading={integrationsLoading || busyProvider === "slack"}
              subtitle={
                integrations.slack.channel_ids.length > 0
                  ? `${integrations.slack.channel_ids.length} channels selected`
                  : "Defaults to your first accessible channels on initial sync"
              }
              onConnect={() => startOAuth("slack")}
              onSync={() => syncProvider("slack")}
              onDisconnect={() => disconnectProvider("slack")}
            />
          </div>

          {success ? (
            <Alert variant="success">
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Action failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {allowManual ? (
            <>
              <Card>
                <CardHeader>
                  <Badge variant="secondary" className="w-fit">
                    Manual Fallback
                  </Badge>
                  <CardTitle className="text-3xl">Use manual ingestion only when needed.</CardTitle>
                  <CardDescription>
                    Sync should be the default path now, but you can still paste a one-off email or Slack message if required.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-2 border-border bg-card shadow-pixel">
                <CardContent className="pt-6">
                  <Tabs
                    value={tab}
                    onValueChange={(value) => {
                      setTab(value as Tab);
                      setSuccess(null);
                      setError(null);
                    }}
                  >
                    <TabsList>
                      <TabsTrigger value="email">
                        <Mail className="h-4 w-4" />
                        Email
                      </TabsTrigger>
                      <TabsTrigger value="slack">
                        <MessageSquare className="h-4 w-4" />
                        Slack
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardContent>
              </Card>

              <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <TabsContent value="email">
                    <Card className="border-2 border-border bg-card shadow-pixel">
                      <CardContent className="pt-6">
                      <form onSubmit={submitEmail} className="space-y-5">
                        <div className="space-y-2">
                          <Label>From</Label>
                          <Input
                            type="email"
                            value={emailFrom}
                            onChange={(e) => setEmailFrom(e.target.value)}
                            placeholder="investor@vc-firm.com"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Subject</Label>
                          <Input
                            type="text"
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            placeholder="Re: Q2 roadmap review"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Body</Label>
                          <Textarea
                            value={emailBody}
                            onChange={(e) => setEmailBody(e.target.value)}
                            placeholder="Paste the email body here..."
                            required
                            rows={8}
                          />
                        </div>
                        <SubmitButton
                          loading={submittingManual}
                          label="Ingest Email"
                        />
                      </form>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="slack">
                    <Card className="border-2 border-border bg-card shadow-pixel">
                      <CardContent className="pt-6">
                      <form onSubmit={submitSlack} className="space-y-5">
                        <div className="space-y-2">
                          <Label>Channel</Label>
                          <Input
                            type="text"
                            value={slackChannel}
                            onChange={(e) => setSlackChannel(e.target.value)}
                            placeholder="engineering"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Message</Label>
                          <Textarea
                            value={slackMessage}
                            onChange={(e) => setSlackMessage(e.target.value)}
                            placeholder="Paste the Slack message here..."
                            required
                            rows={8}
                          />
                        </div>
                        <SubmitButton
                          loading={submittingManual}
                          label="Ingest Message"
                        />
                      </form>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </motion.div>
              </Tabs>
            </>
          ) : (
            <Alert variant="info">
              <AlertTitle>Manual ingest disabled</AlertTitle>
              <AlertDescription>
                Connect Google and Slack above, then use the sync buttons to populate the feed.
              </AlertDescription>
            </Alert>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="h-full">
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Processing Path
              </Badge>
              <CardTitle className="text-2xl">
                Connected sync becomes the default workflow.
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  icon: CalendarSync,
                  title: "Connect",
                  body: "Authorize Google and Slack once so the backend can fetch user-specific context with the stored encrypted tokens.",
                },
                {
                  icon: Shield,
                  title: "Protect",
                  body: "Fetched content still passes through the same redaction, encryption, and archive path as manual ingestion.",
                },
                {
                  icon: Sparkles,
                  title: "Surface",
                  body: "Emails, channel messages, and upcoming meetings appear in the feed and power the Guide without copying content by hand.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400">
                    <Icon className="h-4 w-4 text-foreground" />
                  </div>
                  <p className="mono-label mb-2">{title}</p>
                  <p className="text-sm leading-7 text-muted-foreground">{body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function IntegrationCard({
  title,
  description,
  icon: Icon,
  connected,
  loading,
  lastSyncedAt,
  subtitle,
  onConnect,
  onSync,
  onDisconnect,
}: {
  title: string;
  description: string;
  icon: typeof Mail;
  connected: boolean;
  loading: boolean;
  lastSyncedAt: string | null;
  subtitle?: string;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  return (
    <Card className="transition-transform duration-200 hover:-translate-y-0.5">
      <CardContent className="flex h-full flex-col justify-between gap-8 pt-6">
        <div className="space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{title}</h2>
              <Badge variant={connected ? "default" : "secondary"}>
                {connected ? "Connected" : "Not connected"}
              </Badge>
            </div>
            <p className="text-sm leading-7 text-muted-foreground">{description}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {connected
                ? `Last synced ${lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : "never"}`
                : subtitle || "Connect to enable syncing"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button onClick={onConnect} disabled={loading}>
              {loading ? "Opening..." : "Connect"}
            </Button>
          ) : (
            <>
              <Button onClick={onSync} disabled={loading}>
                {loading ? "Syncing..." : "Sync Now"}
              </Button>
              <Button variant="secondary" onClick={onDisconnect} disabled={loading}>
                <Unplug className="h-4 w-4" />
                Disconnect
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
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
