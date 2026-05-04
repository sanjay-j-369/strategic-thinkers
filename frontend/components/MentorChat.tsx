"use client";

import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Send, Square, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface MentorChatProps {
  token: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  systemPrompt?: string;
}

export function MentorChat({
  token,
  title = "Chat with Mentor",
  subtitle = "Ask strategic questions about your startup",
  placeholder = "What should I prioritize this quarter?",
  systemPrompt,
}: MentorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || loading) return;

      const userMessage: ChatMessage = { role: "user", content: trimmed, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);
      setError(null);

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const body: { message: string; history: typeof history; systemPrompt?: string } = {
          message: trimmed,
          history,
        };
        if (systemPrompt) {
          body.systemPrompt = systemPrompt;
        }

        const data = await apiFetch<{ reply: string }>("/api/chat", {
          method: "POST",
          token,
          json: body,
        });

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.reply || "I couldn't generate a response. Please try again.",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get response");
      } finally {
        setLoading(false);
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    },
    [input, loading, messages, token, systemPrompt]
  );

  return (
    <Card className="border border-border bg-card flex flex-col h-[600px]">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Badge variant="secondary" className="w-fit">
              <Bot className="h-3 w-3 mr-1" />
              AI Mentor
            </Badge>
            <CardTitle className="text-xl font-black uppercase tracking-tight text-foreground">
              {title}
            </CardTitle>
            <p className="text-sm text-foreground/60">{subtitle}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {messages.length === 0 && !loading && (
              <div className="text-center py-12">
                <Bot className="h-12 w-12 mx-auto text-foreground/30 mb-4" />
                <p className="text-sm text-foreground/50">Start a conversation with your mentor</p>
                <p className="text-xs text-foreground/30 mt-1">Ask about strategy, hiring, growth, or anything on your mind</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  <div className="text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert [&_strong]:font-semibold">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.timestamp && (
                    <p className={`text-xs mt-2 ${msg.role === "user" ? "text-primary-foreground/60" : "text-foreground/40"}`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl px-4 py-3 bg-secondary text-secondary-foreground">
                  <p className="text-sm animate-pulse">Thinking...</p>
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="border-t border-border p-4 space-y-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            className="min-h-[80px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit(e);
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-foreground/40">Press Enter to send, Shift+Enter for new line</p>
            <div className="flex gap-2">
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMessages([])}
                >
                  Clear
                </Button>
              )}
              <Button type="submit" size="sm" disabled={loading || !input.trim()}>
                {loading ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {loading ? "Thinking..." : "Send"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}