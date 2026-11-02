"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, AlertTriangle, ChevronDown } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  cachesUsed?: string[];
}

interface Detection {
  drug: string;
  reactionType: string;
  severity: string;
  suggestedTests: string[];
}

export function ChatPanel() {
  const [open, setOpen]               = useState(false);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [sending, setSending]         = useState(false);
  const [convId, setConvId]           = useState<string | null>(null);
  const [ending, setEnding]           = useState(false);
  const [endResult, setEndResult]     = useState<{ detectionsFound: number; detections: Detection[] } | null>(null);
  const [loading, setLoading]         = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Resume active conversation when chat opens
  useEffect(() => {
    if (!open || convId) return;
    setLoading(true);
    fetch("/api/chat?active=true")
      .then(r => r.json())
      .then(data => {
        if (data.active) {
          setConvId(data.active._id);
          setMessages(
            (data.active.messages ?? []).map((m: { role: string; content: string; provider?: string; cachesUsed?: string[] }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              provider: m.provider,
              cachesUsed: m.cachesUsed,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, convId]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setMessages(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: convId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.error ?? res.statusText}` }]);
        return;
      }

      const data = await res.json();
      setConvId(data.conversationId);

      const newMessages: Message[] = [];
      if (data.greeting) {
        newMessages.push({ role: "assistant", content: data.greeting });
      }
      newMessages.push({
        role: "assistant",
        content: data.reply,
        provider: data.provider,
        cachesUsed: data.cachesUsed,
      });

      setMessages(prev => [...prev, ...newMessages]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : "Network error"}` }]);
    } finally {
      setSending(false);
    }
  }, [input, sending, convId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const endChat = async () => {
    if (!convId || ending) return;
    setEnding(true);
    try {
      const res = await fetch("/api/chat/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId }),
      });
      if (res.ok) {
        const data = await res.json();
        setEndResult(data);
      }
    } catch { /* ignore */ } finally {
      setEnding(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setConvId(null);
    setEndResult(null);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-brand-gradient hover:brightness-105 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        aria-label="Open chat"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-[380px] h-[560px] bg-surface rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-brand-gradient text-white shrink-0">
        <div>
          <h3 className="font-semibold text-sm">MediIQ Assistant</h3>
          <p className="text-[10px] text-blue-100">Post-consultation support</p>
        </div>
        <div className="flex items-center gap-1">
          {convId && !endResult && (
            <button onClick={endChat} disabled={ending} className="text-[10px] px-2 py-1 rounded bg-brand-500/100 hover:bg-blue-400 disabled:opacity-50 transition-colors">
              {ending ? "Closing..." : "End chat"}
            </button>
          )}
          <button onClick={() => setOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-brand-500/100 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* End-of-chat detections */}
      {endResult && (
        <div className="px-4 py-3 bg-surface-2 border-b border-border shrink-0">
          {endResult.detectionsFound > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-semibold">{endResult.detectionsFound} finding(s) flagged for review</span>
              </div>
              {endResult.detections?.map((d, i) => (
                <div key={i} className="text-xs bg-amber-50 rounded-lg p-2 border border-amber-200">
                  <p className="font-medium text-amber-800">{d.drug} — {d.reactionType}</p>
                  {d.suggestedTests?.length > 0 && (
                    <p className="text-amber-600 mt-0.5">Tests: {d.suggestedTests.join(", ")}</p>
                  )}
                </div>
              ))}
              <p className="text-[10px] text-muted">These findings are pending your review in your profile.</p>
            </div>
          ) : (
            <p className="text-xs text-muted">Chat closed — no new findings detected.</p>
          )}
          <button onClick={startNewChat} className="mt-2 text-xs text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:text-brand-300 font-medium">
            Start new conversation
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && !endResult && (
          <div className="text-center py-8">
            <MessageCircle className="w-10 h-10 text-subtle mx-auto mb-3" />
            <p className="text-sm text-muted font-medium">How can I help you today?</p>
            <p className="text-xs text-subtle mt-1">Ask about your medicines, symptoms, or side effects</p>
            <div className="mt-4 space-y-2">
              {["When should I take my medicine?", "I got a rash after taking my pills", "What foods should I avoid?"].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-surface-2 hover:bg-slate-100 text-muted transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-brand-gradient text-white rounded-br-md"
                : "bg-slate-100 text-text rounded-bl-md"
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.role === "assistant" && msg.provider && (
                <p className="text-[9px] mt-1 opacity-50">{msg.provider}{msg.cachesUsed?.length ? ` + ${msg.cachesUsed.join(",")}` : ""}</p>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-subtle" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      {!endResult && (
        <div className="px-3 py-3 border-t border-border shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent max-h-24"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-full bg-brand-gradient hover:brightness-105 disabled:bg-slate-200 text-white flex items-center justify-center transition-colors shrink-0"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
