"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, LoaderCircle, Send, Sparkles, UserCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useRequireAuth } from "@/lib/use-require-auth";

const STARTERS = [
  "Should I hire a CTO now or keep outsourcing?",
  "We have 4 months runway. Raise or cut costs?",
  "Our MRR is $8k and an investor wants Series A terms. Too early?",
  "Should I hire sales before product-market fit?",
];

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const { ready, token } = useRequireAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "I have context from your emails, Slack, and meetings. Ask for a decision memo, a risk readout, or a tactical next move.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text?: string) {
    const message = text || input.trim();
    if (!message || loading || !token) return;

    const userMessage: Message = { role: "user", content: message };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const data = await apiFetch<{ reply: string }>("/api/chat", {
        method: "POST",
        token,
        json: {
          message,
          history: nextMessages
            .slice(-10)
            .map((entry) => ({ role: entry.role, content: entry.content })),
        },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <Card>
        <CardContent className="py-20 text-center text-sm text-zinc-500">
          Loading guide workspace...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="h-full">
          <CardHeader>
            <Badge className="w-fit">Strategic AI Advisor</Badge>
            <CardTitle className="text-3xl">Ask for the next best move.</CardTitle>
            <CardDescription>
              The guide reads your operational context and answers in memo form, not generic chat filler.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <p className="mono-label">Starter Prompts</p>
              {STARTERS.map((starter) => (
                <Button
                  key={starter}
                  variant="secondary"
                  className="h-auto w-full justify-start whitespace-normal rounded-[22px] px-4 py-4 text-left leading-6"
                  onClick={() => send(starter)}
                  disabled={loading}
                >
                  <Sparkles className="mt-1 h-4 w-4 shrink-0" />
                  <span>{starter}</span>
                </Button>
              ))}
            </div>

            <div className="rounded-[24px] border border-white/10 bg-black/30 p-4">
              <p className="mono-label mb-2">What It Knows</p>
              <p className="text-sm leading-7 text-zinc-400">
                Recent archive entries, scheduled meetings, and context retrieved from memory before each answer.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-white/10 pb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="w-fit">
                  Live Conversation
                </Badge>
                <CardTitle className="text-3xl">Guide workspace</CardTitle>
                <CardDescription>
                  Ask sharp questions. The assistant answers using your founder context, not canned frameworks.
                </CardDescription>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] font-mono uppercase tracking-[0.24em] text-zinc-500">
                {loading ? "Thinking" : "Ready"}
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex h-[calc(100vh-14rem)] flex-col pt-6">
            <div className="flex-1 space-y-4 overflow-y-auto pr-2">
              <AnimatePresence initial={false}>
                {messages.map((message, index) => {
                  const isUser = message.role === "user";

                  return (
                    <motion.div
                      key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`chat-bubble max-w-[86%] ${
                          isUser ? "chat-bubble-user" : "chat-bubble-assistant"
                        }`}
                      >
                        <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.24em]">
                          {isUser ? (
                            <>
                              <UserCircle2 className="h-4 w-4" />
                              <span>User</span>
                            </>
                          ) : (
                            <>
                              <Bot className="h-4 w-4" />
                              <span>Guide</span>
                            </>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </motion.div>
                  );
                })}

                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="chat-bubble chat-bubble-assistant flex items-center gap-3">
                      <LoaderCircle className="h-4 w-4 animate-spin text-zinc-300" />
                      <span className="text-sm text-zinc-400">
                        Synthesizing a response from the latest context.
                      </span>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <div ref={bottomRef} />
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-black/40 p-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Ask a strategic question..."
                  disabled={loading}
                  className="h-12 flex-1 border-0 bg-transparent px-4 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <Badge variant="secondary" className="hidden md:inline-flex">
                    Founder context attached
                  </Badge>
                  <Button
                    onClick={() => send()}
                    disabled={loading || !input.trim()}
                    size="lg"
                    className="w-full md:w-auto"
                  >
                    {loading ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
