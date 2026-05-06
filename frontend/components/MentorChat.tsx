"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Download, Send, Square, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/providers/auth-provider";
import { apiFetch } from "@/lib/api";
import { extractPIITokens, replacePIITokens, resolvePIITokenValues, tokenizePIILocally } from "@/lib/pii";

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
  compact?: boolean;
  storageKey?: string;
  quickPrompts?: string[];
  workerKey?: string;
  contextTags?: string[];
  runLogPillar?: string;
  runLogAgentName?: string;
  runLogTriggerType?: string;
}

export function MentorChat({
  token,
  title = "Chat with Mentor",
  subtitle = "Ask strategic questions about your startup",
  placeholder = "What should I prioritize this quarter?",
  systemPrompt,
  compact = false,
  storageKey,
  quickPrompts = [],
  workerKey,
  contextTags = [],
  runLogPillar,
  runLogAgentName,
  runLogTriggerType,
}: MentorChatProps) {
  const { privateKey } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resolvedStorageKey = useMemo(
    () => storageKey || `mentor-chat:${title}`,
    [storageKey, title]
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(resolvedStorageKey);
      if (saved) {
        setMessages(JSON.parse(saved) as ChatMessage[]);
      }
    } catch {
      setMessages([]);
    }
  }, [resolvedStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(resolvedStorageKey, JSON.stringify(messages));
    } catch {
      // Ignore local persistence failures.
    }
  }, [messages, resolvedStorageKey]);

  async function resolveVaultTokens(value: string, localMapping: Record<string, string> = {}) {
    let resolved = replacePIITokens(value, localMapping);
    const backendTokens = extractPIITokens(resolved).filter(
      (tokenValue) => !(tokenValue in localMapping)
    );
    if (backendTokens.length === 0) return resolved;

    try {
      const backendPIIMap = await resolvePIITokenValues(backendTokens, token, privateKey);
      resolved = replacePIITokens(resolved, backendPIIMap);
    } catch {
      // Keep vault tokens visible if this browser session has not unlocked private key material.
    }
    return resolved;
  }

  useEffect(() => {
    if (!token || messages.length === 0) return;
    const unresolvedMessages = messages.filter((message) => extractPIITokens(message.content).length > 0);
    if (unresolvedMessages.length === 0) return;

    let active = true;
    async function resolveStoredMessages() {
      const resolved = await Promise.all(
        messages.map(async (message) => ({
          ...message,
          content: await resolveVaultTokens(message.content),
        }))
      );
      if (active && JSON.stringify(resolved) !== JSON.stringify(messages)) {
        setMessages(resolved);
      }
    }

    void resolveStoredMessages();
    return () => {
      active = false;
    };
  }, [messages, privateKey, token]);

  function downloadBlob(filename: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadMarkdown(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    downloadBlob(filename, blob);
  }

  function reportFilename(extension: "md" | "pdf") {
    return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report.${extension}`;
  }

  function plainReportText(content: string) {
    return content
      .replace(/<\/?pdf>/gi, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*[-*]\s+/gm, "- ")
      .trim();
  }

  function escapePdfText(value: string) {
    return value
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  function wrapPdfText(text: string, maxChars = 92) {
    const lines: string[] = [];
    text.split(/\r?\n/).forEach((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push("");
        return;
      }

      let current = "";
      words.forEach((word) => {
        if (!current) {
          current = word;
          return;
        }
        if (`${current} ${word}`.length > maxChars) {
          lines.push(current);
          current = word;
        } else {
          current = `${current} ${word}`;
        }
      });
      if (current) lines.push(current);
    });
    return lines;
  }

  function buildPdfBlob(content: string) {
    const lines = wrapPdfText(plainReportText(content));
    const linesPerPage = 46;
    const pages: string[][] = [];
    for (let index = 0; index < lines.length; index += linesPerPage) {
      pages.push(lines.slice(index, index + linesPerPage));
    }
    if (pages.length === 0) pages.push([""]);

    const objects: string[] = [];
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    const kids = pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ");
    objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);

    pages.forEach((pageLines, pageIndex) => {
      const pageObjectNumber = 3 + pageIndex * 2;
      const contentObjectNumber = pageObjectNumber + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
      );
      const streamLines = [
        "BT",
        "/F1 11 Tf",
        "50 742 Td",
        "14 TL",
        ...pageLines.map((line, index) => `${index === 0 ? "" : "T* "}${`(${escapePdfText(line)}) Tj`}`),
        "ET",
      ];
      const stream = streamLines.join("\n");
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return new Blob([pdf], { type: "application/pdf" });
  }

  async function downloadTranscript() {
    const resolvedMessages = await Promise.all(
      messages.map(async (message) => ({
        ...message,
        content: await resolveVaultTokens(message.content),
      }))
    );
    const content = resolvedMessages
      .map((message) => `## ${message.role === "user" ? "User" : title}\n\n${message.content}`)
      .join("\n\n");
    downloadMarkdown(`${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-history.md`, content);
    setMessages(resolvedMessages);
  }

  async function downloadLatestReport() {
    const latest = [...messages].reverse().find((message) => message.role === "assistant");
    if (!latest) return;
    const resolvedContent = await resolveVaultTokens(latest.content);
    downloadBlob(reportFilename("pdf"), buildPdfBlob(resolvedContent));
    if (resolvedContent !== latest.content) {
      setMessages((current) =>
        current.map((message) =>
          message === latest ? { ...message, content: resolvedContent } : message
        )
      );
    }
  }

  function lastUserAskedForPdf() {
    const latestUser = [...messages].reverse().find((message) => message.role === "user");
    return Boolean(latestUser?.content.match(/\b(pdf|downloadable report|download as pdf)\b/i));
  }

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
        let chatPIIMap: Record<string, string> = {};
        const history = messages.map((m) => {
          const tokenized = tokenizePIILocally(m.content, chatPIIMap);
          chatPIIMap = tokenized.mapping;
          return { role: m.role, content: tokenized.redacted };
        });
        const tokenizedInput = tokenizePIILocally(trimmed, chatPIIMap);
        chatPIIMap = tokenizedInput.mapping;
        const body: {
          message: string;
          history: typeof history;
          systemPrompt?: string;
          workerKey?: string;
          contextTags?: string[];
          runLogPillar?: string;
          runLogAgentName?: string;
          runLogTriggerType?: string;
        } = {
          message: tokenizedInput.redacted,
          history,
        };
        if (systemPrompt) {
          body.systemPrompt = systemPrompt;
        }
        if (workerKey) {
          body.workerKey = workerKey;
        }
        if (contextTags.length > 0) {
          body.contextTags = contextTags;
        }
        if (runLogPillar && runLogAgentName) {
          body.runLogPillar = runLogPillar;
          body.runLogAgentName = runLogAgentName;
          body.runLogTriggerType = runLogTriggerType || "chat";
        }

        const data = await apiFetch<{ reply: string }>("/api/chat", {
          method: "POST",
          token,
          json: body,
        });

        const assistantContent = await resolveVaultTokens(
          data.reply || "I couldn't generate a response. Please try again.",
          chatPIIMap
        );

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: assistantContent,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        if (trimmed.match(/\b(pdf|downloadable report|download as pdf)\b/i)) {
          setTimeout(() => {
            downloadBlob(reportFilename("pdf"), buildPdfBlob(assistantContent));
          }, 100);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get response");
      } finally {
        setLoading(false);
        setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    },
    [
      contextTags,
      input,
      loading,
      messages,
      privateKey,
      runLogAgentName,
      runLogPillar,
      runLogTriggerType,
      systemPrompt,
      token,
      workerKey,
    ]
  );

  return (
    <Card className={`flex flex-col ${
      compact
        ? "h-full border-0 rounded-none shadow-none bg-transparent"
        : "border border-border bg-card h-[600px]"
    }`}>
      {!compact && (
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
      )}

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
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
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface-high text-foreground border border-border"
                  }`}
                >
                  {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-elevated text-foreground border border-border shadow-sm"
                  }`}
                >
                  <div className="text-sm leading-relaxed prose prose-sm max-w-none text-current dark:prose-invert [&_p]:my-2 [&_strong]:font-semibold">
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
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-high text-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl border border-border bg-surface-elevated px-4 py-3 text-foreground shadow-sm">
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

        <form onSubmit={handleSubmit} className={`border-t border-border p-4 space-y-3 shrink-0 ${compact ? "bg-card" : ""}`}>
          {quickPrompts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => setInput(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          ) : null}
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            className={`resize-none bg-background ${compact ? "min-h-[60px]" : "min-h-[80px]"}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit(e);
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-foreground/50">Press Enter to send, Shift+Enter for new line</p>
            <div className="flex gap-2">
              {messages.some((message) => message.role === "assistant") ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void downloadLatestReport()}>
                  <Download className="h-4 w-4" />
                  {lastUserAskedForPdf() ? "PDF" : "Report PDF"}
                </Button>
              ) : null}
              {messages.length > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void downloadTranscript()}>
                  <Download className="h-4 w-4" />
                  History
                </Button>
              ) : null}
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
