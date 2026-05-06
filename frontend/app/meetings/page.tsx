"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Plus,
  Trash2,
  Users,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";

interface Meeting {
  id: string;
  topic: string;
  attendees: string[];
  scheduled_at: string;
  summary?: string;
  status: "upcoming" | "prepped" | "past";
}

type ToastKind = "success" | "error";

interface ToastState {
  kind: ToastKind;
  message: string;
}

export default function MeetingsPage() {
  const { ready, token } = useRequireAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [attendees, setAttendees] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const upcomingCount = useMemo(
    () =>
      meetings.filter((meeting) => new Date(meeting.scheduled_at) > new Date())
        .length,
    [meetings]
  );
  const preppedCount = useMemo(
    () => meetings.filter((meeting) => meeting.status === "prepped").length,
    [meetings]
  );
  const pastCount = useMemo(
    () => meetings.filter((meeting) => meeting.status === "past").length,
    [meetings]
  );

  const sections = useMemo(() => ({
    upcoming: meetings.filter((meeting) => meeting.status === "upcoming"),
    prepped: meetings.filter((meeting) => meeting.status === "prepped"),
    past: meetings.filter((meeting) => meeting.status === "past"),
  }), [meetings]);

  const pushToast = useCallback((message: string, kind: ToastKind) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ kind, message });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const fetchMeetings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ meetings: Meeting[] }>("/api/meetings", { token });
      setMeetings(data.meetings || []);
    } catch {
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) {
      void fetchMeetings();
    }
  }, [fetchMeetings, ready]);

  async function scheduleMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setSuccess(null);
    setError(null);

    try {
      await apiFetch("/api/meetings", {
        method: "POST",
        token,
        json: {
          topic,
          attendees: attendees
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
          scheduled_at: scheduledAt || new Date().toISOString(),
        },
      });
      setSuccess("Meeting scheduled. The prep card will appear in the feed.");
      setTopic("");
      setAttendees("");
      setScheduledAt("");
      setDialogOpen(false);
      await fetchMeetings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scheduling failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteMeeting(meeting: Meeting) {
    if (!token) return;
    const snapshot = meetings;
    setDeleteLoading(true);
    setDeleteTarget(null);
    setMeetings((current) => current.filter((item) => item.id !== meeting.id));

    try {
      await apiFetch(`/api/meetings/${meeting.id}`, {
        method: "DELETE",
        token,
      });
      pushToast("Meeting deleted.", "success");
    } catch (err) {
      setMeetings(snapshot);
      pushToast(err instanceof Error ? err.message : "Failed to delete meeting", "error");
      await fetchMeetings();
    } finally {
      setDeleteLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <div className="space-y-6">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_340px]"
        >
          <Card>
            <CardHeader>
              <Badge className="w-fit">Meetings</Badge>
              <CardTitle className="text-4xl">
                Schedule the room, prep the context.
              </CardTitle>
              <CardDescription className="max-w-2xl text-base">
                Add a meeting manually or let synced Google Calendar events populate this view and queue prep cards for the feed.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 border-t border-border pt-6">
              <DialogTrigger asChild>
                <Button size="lg">
                  <Plus className="h-4 w-4" />
                  Schedule Meeting
                </Button>
              </DialogTrigger>
              <Button variant="secondary" size="lg" onClick={() => fetchMeetings()}>
                Refresh List
              </Button>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {[
              { label: "Upcoming", value: upcomingCount, icon: CalendarDays },
              { label: "Prepped", value: preppedCount, icon: Clock3 },
              { label: "Past", value: pastCount, icon: CalendarDays },
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

        {success ? (
          <Alert variant="success">
            <AlertTitle>Scheduled</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Scheduling failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-28 w-full" />
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-4 py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-border bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400">
                <CalendarDays className="h-6 w-6 text-foreground" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-foreground">No meetings scheduled</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  Create one manually or sync Google Calendar from the ingest page.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {(["upcoming", "prepped", "past"] as const).map((status) => {
              const items = sections[status];
              if (items.length === 0) return null;

              const title = status === "upcoming" ? "Upcoming" : status === "prepped" ? "Prepped" : "Past";

              return (
                <section key={status} className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {items.length} meeting{items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {items.map((meeting, index) => (
                      <motion.div
                        key={meeting.id}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.03 }}
                      >
                        <MeetingCard
                          meeting={meeting}
                          onDelete={() => setDeleteTarget(meeting)}
                        />
                      </motion.div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {toast ? (
        <div
          className={`fixed right-6 top-6 z-[70] max-w-sm rounded-2xl border px-4 py-3 shadow-soft-lg ${
            toast.kind === "success"
              ? "border-emerald-500/30 bg-emerald-50 text-emerald-900"
              : "border-red-500/30 bg-red-50 text-red-900"
          }`}
        >
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      ) : null}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete meeting</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this meeting?
              {deleteTarget?.status === "prepped"
                ? " This meeting already has prep and cannot be deleted until the prep card is removed."
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">{deleteTarget?.topic}</p>
            {deleteTarget ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date(deleteTarget.scheduled_at).toLocaleString()}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteTarget && void deleteMeeting(deleteTarget)}
              disabled={deleteLoading || deleteTarget?.status === "prepped"}
            >
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogContent>
        <form onSubmit={scheduleMeeting} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Schedule meeting</DialogTitle>
            <DialogDescription>
              Add the topic, participants, and time. Prep content will appear in the feed once the backend completes the job.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Meeting Topic</Label>
            <Input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Q2 roadmap review with Marcus"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Attendees</Label>
            <Input
              type="text"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="marcus@client.com, sarah@vc.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Date and Time</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Scheduling..." : "Create Meeting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MeetingCard({ meeting, onDelete }: { meeting: Meeting; onDelete: () => void }) {
  const date = new Date(meeting.scheduled_at);
  const isUpcoming = meeting.status === "upcoming" || date > new Date();
  const meetLink = meeting.summary?.match(/Meet Link: (https?:\/\/[^\s]+)/)?.[1];
  const summaryText = meeting.summary?.replace(/Meet Link:.*/, "").trim();
  const statusLabel = meeting.status === "prepped" ? "Prepped" : isUpcoming ? "Upcoming" : "Past";

  return (
    <Card className="transition-transform duration-200 hover:-translate-y-0.5">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={isUpcoming ? "default" : "secondary"}>
                {statusLabel}
              </Badge>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                {date.toLocaleString()}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-foreground">{meeting.topic}</h3>
              {meeting.attendees?.length > 0 ? (
                <div className="flex items-start gap-2 text-sm leading-7 text-muted-foreground">
                  <Users className="mt-1 h-4 w-4 shrink-0" />
                  <span>{meeting.attendees.join(", ")}</span>
                </div>
              ) : null}
            </div>

            {summaryText ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mono-label mb-2">Prep Summary</p>
                <p className="text-sm leading-7 text-muted-foreground">{summaryText}</p>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            {meetLink ? (
              <Button asChild variant="secondary">
                <a href={meetLink} target="_blank" rel="noopener noreferrer">
                  Join Meeting
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
