"use client";
import { useState, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const DEMO_USER_ID = "d4c615b8-cedc-4c97-80ed-2c8373610d78";

interface Meeting {
  id: string;
  topic: string;
  attendees: string[];
  scheduled_at: string;
  summary?: string;
  status: "upcoming" | "prepped" | "done";
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [topic, setTopic] = useState("");
  const [attendees, setAttendees] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => { fetchMeetings(); }, []);

  async function fetchMeetings() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/meetings?user_id=${DEMO_USER_ID}`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch {}
    finally { setLoading(false); }
  }

  async function scheduleMeeting(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setSuccess(null);
    try {
      const res = await fetch(`${API_URL}/api/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEMO_USER_ID,
          topic,
          attendees: attendees.split(",").map(a => a.trim()).filter(Boolean),
          scheduled_at: scheduledAt || new Date().toISOString(),
        }),
      });
      if (!res.ok) throw new Error();
      setSuccess("Meeting scheduled — AI prep card will appear in your Feed.");
      setTopic(""); setAttendees(""); setScheduledAt("");
      setShowForm(false);
      fetchMeetings();
    } catch {
      setSuccess(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-amber-300 mb-4">
            <span>📅</span> Meetings
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Scheduled Meetings</h1>
          <p className="text-gray-400">Schedule a meeting and get an AI-generated prep card before it starts.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="mt-6 flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg"
        >
          <span className="text-lg">+</span> Schedule Meeting
        </button>
      </div>

      {/* Schedule Form */}
      {showForm && (
        <form onSubmit={scheduleMeeting} className="glass rounded-2xl p-6 mb-6 space-y-4 animate-fade-in glow-amber">
          <h2 className="text-white font-semibold text-lg">New Meeting</h2>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Meeting Topic</label>
            <input
              type="text"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Q2 Roadmap Review with Marcus"
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Attendees (comma-separated emails)</label>
            <input
              type="text"
              value={attendees}
              onChange={e => setAttendees(e.target.value)}
              placeholder="marcus@client.com, sarah@vc.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Date & Time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium transition-all"
            >
              {submitting ? "Scheduling..." : "Schedule & Generate Prep"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 rounded-lg glass glass-hover text-gray-400"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {success && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm animate-fade-in">
          ✅ {success}
        </div>
      )}

      {/* Meetings List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="glass rounded-xl p-5 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-1/2 mb-3" />
              <div className="h-3 bg-white/5 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <div className="glass rounded-2xl p-16 text-center">
          <div className="text-5xl mb-4">📅</div>
          <p className="text-lg text-white font-medium mb-2">No meetings scheduled</p>
          <p className="text-sm text-gray-500">Click "Schedule Meeting" to add one and get an AI prep card.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const date = new Date(meeting.scheduled_at);
  const isUpcoming = date > new Date();

  // Extract meet link from summary if present
  const meetLink = meeting.summary?.match(/Meet Link: (https?:\/\/[^\s]+)/)?.[1];

  return (
    <div className={`glass rounded-xl p-5 animate-fade-in ${isUpcoming ? "glow-amber" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${isUpcoming ? "bg-amber-400 animate-pulse" : "bg-gray-600"}`} />
            <span className={`text-xs font-medium ${isUpcoming ? "text-amber-400" : "text-gray-500"}`}>
              {isUpcoming ? "Upcoming" : "Past"}
            </span>
          </div>
          <h3 className="text-white font-semibold text-base">{meeting.topic}</h3>
          {meeting.attendees?.length > 0 && (
            <p className="text-gray-400 text-sm mt-1">
              👥 {meeting.attendees.join(", ")}
            </p>
          )}
          {meetLink && (
            <a
              href={meetLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs hover:bg-emerald-500/30 transition-all"
            >
              <span>📹</span> Join Meeting
            </a>
          )}
          {meeting.summary && !meetLink && (
            <p className="text-gray-300 text-sm mt-2 leading-relaxed border-t border-white/10 pt-2">
              {meeting.summary.replace(/Meet Link:.*/, "").trim()}
            </p>
          )}
        </div>
        <div className="text-right ml-4 shrink-0">
          <p className="text-white text-sm font-medium">
            {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
          <p className="text-gray-400 text-xs">
            {date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
    </div>
  );
}
