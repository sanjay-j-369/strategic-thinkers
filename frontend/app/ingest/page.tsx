"use client";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
const DEMO_USER_ID = "d4c615b8-cedc-4c97-80ed-2c8373610d78";

type Tab = "email" | "slack";

export default function IngestPage() {
  const [tab, setTab] = useState<Tab>("email");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email form
  const [emailFrom, setEmailFrom] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  // Slack form
  const [slackChannel, setSlackChannel] = useState("");
  const [slackMessage, setSlackMessage] = useState("");

  const allowManual = process.env.NEXT_PUBLIC_ALLOW_MANUAL_INGESTION === "true" || process.env.NEXT_PUBLIC_INGESTION_MODE === "simulate";

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setSuccess(null); setError(null);
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
      setSuccess("Email ingested — check your Feed for the processed card.");
      setEmailFrom(""); setEmailSubject(""); setEmailBody("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitSlack(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setSuccess(null); setError(null);
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
      setSuccess("Slack message ingested — check your Feed.");
      setSlackChannel(""); setSlackMessage("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  if (!allowManual) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-indigo-300 mb-4">
            <span>🔗</span> Data Integrations
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Connect Your Data Sources</h1>
          <p className="text-gray-400">Connect Google Calendar, Gmail, and Slack to stream meeting context automatically in the background.</p>
        </div>
        
        <div className="space-y-4">
          <button 
            onClick={() => setSuccess("Google Mail & Calendar integration coming soon!")}
            className="flex items-center justify-between w-full p-4 glass rounded-xl hover:bg-white/5 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-xl">📧</div>
              <div className="text-left">
                <h3 className="text-white font-medium">Google Mail & Calendar</h3>
                <p className="text-gray-400 text-sm">Automatically ingest emails and sync meetings</p>
              </div>
            </div>
            <span className="px-4 py-2 bg-white/10 rounded-lg text-sm text-white group-hover:bg-white/20 transition-colors">Connect Google</span>
          </button>
          
          <button 
            onClick={() => setSuccess("Slack integration coming soon!")}
            className="flex items-center justify-between w-full p-4 glass rounded-xl hover:bg-white/5 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-xl">💬</div>
              <div className="text-left">
                <h3 className="text-white font-medium">Slack</h3>
                <p className="text-gray-400 text-sm">Listen for updates in specific #channels</p>
              </div>
            </div>
            <span className="px-4 py-2 bg-white/10 rounded-lg text-sm text-white group-hover:bg-white/20 transition-colors">Connect Slack</span>
          </button>
        </div>

        {/* Feedback */}
        {success && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm animate-fade-in">
            {success}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-indigo-300 mb-4">
          <span>📥</span> Data Ingestion
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Ingest Your Data</h1>
        <p className="text-gray-400">Paste an email or Slack message — the AI pipeline will process, redact PII, and embed it.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 glass rounded-xl p-1 w-fit">
        {(["email", "slack"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSuccess(null); setError(null); }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              tab === t
                ? "bg-indigo-600 text-white shadow-lg"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t === "email" ? "📧 Email" : "💬 Slack"}
          </button>
        ))}
      </div>

      {/* Email Form */}
      {tab === "email" && (
        <form onSubmit={submitEmail} className="glass rounded-2xl p-6 space-y-4 animate-fade-in">
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">From</label>
            <input
              type="email"
              value={emailFrom}
              onChange={e => setEmailFrom(e.target.value)}
              placeholder="investor@vc-firm.com"
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Subject</label>
            <input
              type="text"
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              placeholder="Re: Q2 Roadmap Review"
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Body</label>
            <textarea
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              placeholder="Paste the email body here..."
              required
              rows={6}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>
          <SubmitButton loading={loading} label="Ingest Email" />
        </form>
      )}

      {/* Slack Form */}
      {tab === "slack" && (
        <form onSubmit={submitSlack} className="glass rounded-2xl p-6 space-y-4 animate-fade-in">
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Channel</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">#</span>
              <input
                type="text"
                value={slackChannel}
                onChange={e => setSlackChannel(e.target.value)}
                placeholder="engineering"
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wide mb-1.5">Message</label>
            <textarea
              value={slackMessage}
              onChange={e => setSlackMessage(e.target.value)}
              placeholder="Paste the Slack message here..."
              required
              rows={6}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>
          <SubmitButton loading={loading} label="Ingest Message" />
        </form>
      )}

      {/* Feedback */}
      {success && (
        <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm animate-fade-in">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm animate-fade-in">
          ❌ {error}
        </div>
      )}
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-medium transition-all duration-150 shadow-lg"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Processing...
        </span>
      ) : label}
    </button>
  );
}
