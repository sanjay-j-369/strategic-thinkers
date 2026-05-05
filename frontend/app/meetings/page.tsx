"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Plus,
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
  status: "upcoming" | "prepped" | "done";
}

export default function MeetingsPage() {
  const { ready, token } = useRequireAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [attendees, setAttendees] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function deleteMeeting(meetingId: string) {
    if (!token || deletingMeetingId) return;
    setDeletingMeetingId(meetingId);
    setSuccess(null);
    setError(null);

    try {
      await apiFetch(`/api/meetings/${meetingId}`, {
        method: "DELETE",
        token,
      });
      setMeetings((current) => current.filter((meeting) => meeting.id !== meetingId));
      setSuccess("Prep content removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingMeetingId(null);
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
          <div className="space-y-4">
            {meetings.map((meeting, index) => (
              <motion.div
                key={meeting.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
              >
                <MeetingCard
                  meeting={meeting}
                  onDelete={() => void deleteMeeting(meeting.id)}
                  deleting={deletingMeetingId === meeting.id}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

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

function MeetingCard({
  meeting,
  onDelete,
  deleting,
}: {
  meeting: Meeting;
  onDelete: () => void;
  deleting: boolean;
}) {
  const date = new Date(meeting.scheduled_at);
  const isUpcoming = date > new Date();
  const meetLink = meeting.summary?.match(/Meet Link: (https?:\/\/[^\s]+)/)?.[1];
  const summaryText = meeting.summary?.replace(/Meet Link:.*/, "").trim();

  return (
    <Card className="transition-transform duration-200 hover:-translate-y-0.5">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={isUpcoming ? "default" : "secondary"}>
                {isUpcoming ? "Upcoming" : "Past"}
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
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="mono-label">Prep Summary</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={onDelete}
                    disabled={deleting}
                  >
                    {deleting ? "Removing..." : "Delete"}
                  </Button>
                </div>
                <p className="text-sm leading-7 text-muted-foreground">{summaryText}</p>
              </div>
            ) : null}
          </div>

          {meetLink ? (
            <Button asChild variant="secondary" className="shrink-0">
              <a href={meetLink} target="_blank" rel="noopener noreferrer">
                Join Meeting
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
