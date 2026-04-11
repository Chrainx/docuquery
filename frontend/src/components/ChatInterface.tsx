"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { queryDocumentStream } from "@/lib/api";
import type { ChatMessage, Directory, Document, SourceChunk } from "@/types";

interface ChatInterfaceProps {
  documents: Document[];
  directories: Directory[];
  selectedDocId?: string;
  selectedDirectoryId?: string;
  onSelectDoc: (id: string | undefined) => void;
  onSelectDirectory: (id: string | null) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
}

function SourcePanel({ sources }: { sources: SourceChunk[] }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-slate-400 hover:text-slate-300"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-brand-400" />
          {sources.length} source{sources.length !== 1 && "s"} cited
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <div className="divide-y divide-white/5 border-t border-white/5">
          {sources.map((src, i) => (
            <div key={i} className="px-3 py-2.5 text-xs">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-500/20 px-2 py-0.5 font-semibold text-brand-300">
                  p.{src.page_numbers.join(", ")}
                </span>
                <span className="text-slate-600">{(src.similarity_score * 100).toFixed(0)}% match</span>
                <span className="truncate text-slate-600">{src.filename}</span>
              </div>
              <p className="leading-relaxed text-slate-400">
                {src.content.length > 300 ? src.content.slice(0, 300) + "…" : src.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatInterface({
  documents, directories, selectedDocId, selectedDirectoryId,
  onSelectDoc, onSelectDirectory, messages, setMessages,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isLoading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: question, timestamp: new Date() };
    const aId = crypto.randomUUID();
    const aMsg: ChatMessage = { id: aId, role: "assistant", content: "", timestamp: new Date() };

    setMessages((p) => [...p, userMsg, aMsg]);
    setInput("");
    setIsLoading(true);

    try {
      await queryDocumentStream(
        question, selectedDocId, selectedDirectoryId, 5,
        (token) => setMessages((p) => p.map((m) => m.id === aId ? { ...m, content: m.content + token } : m)),
        (sources) => setMessages((p) => p.map((m) => m.id === aId ? { ...m, sources } : m)),
        (err) => setMessages((p) => p.map((m) => m.id === aId ? { ...m, content: `Error: ${err}` } : m)),
      );
    } catch (err) {
      setMessages((p) => p.map((m) => m.id === aId ? {
        ...m, content: err instanceof Error ? `Error: ${err.message}` : "An unexpected error occurred.",
      } : m));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const hasDocuments = documents.length > 0;
  const contextLabel = selectedDirectoryId
    ? (directories.find((d) => d.id === selectedDirectoryId)?.name ?? "directory")
    : selectedDocId
      ? (documents.find((d) => d.id === selectedDocId)?.filename ?? "document")
      : "all documents";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="border-b border-white/5 px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Chat</span>
          </div>
          {messages.length > 0 && (
            <button onClick={() => setMessages([])} className="flex items-center gap-1 text-xs text-slate-600 transition-colors hover:text-red-400">
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {(hasDocuments || directories.length > 0) && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {hasDocuments && (
              <select
                value={selectedDocId || ""}
                onChange={(e) => { onSelectDoc(e.target.value || undefined); if (e.target.value) onSelectDirectory(null); }}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All documents</option>
                {documents.map((doc) => <option key={doc.id} value={doc.id}>{doc.filename}</option>)}
              </select>
            )}
            {directories.length > 0 && (
              <select
                value={selectedDirectoryId || ""}
                onChange={(e) => { onSelectDirectory(e.target.value || null); if (e.target.value) onSelectDoc(undefined); }}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All directories</option>
                {directories.map((dir) => <option key={dir.id} value={dir.id}>📁 {dir.name}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-brand-500/20 blur-xl" />
              <div className="relative rounded-2xl bg-gradient-to-br from-brand-500/20 to-brand-600/10 p-5 ring-1 ring-brand-500/20">
                <Sparkles className="h-10 w-10 text-brand-400" />
              </div>
            </div>
            <div>
              <p className="text-base font-semibold text-slate-300">
                {hasDocuments ? "Ask anything about your documents" : "Upload a PDF to get started"}
              </p>
              {hasDocuments && (
                <p className="mt-1 text-sm text-slate-600">
                  Searching{" "}
                  <span className="font-medium text-brand-400">{contextLabel}</span>
                </p>
              )}
            </div>
            {hasDocuments && (
              <div className="flex flex-wrap justify-center gap-2">
                {["What are the main topics?", "Summarize this document", "What are the key findings?"].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-400 transition-all hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex animate-fade-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === "user"
                ? "bg-brand-600 text-white"
                : "bg-white/5 text-slate-200 ring-1 ring-white/10"
            }`}>
              {msg.content ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              ) : (
                <div className="flex items-center gap-1.5 py-0.5">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:300ms]" />
                </div>
              )}
              {msg.sources && <SourcePanel sources={msg.sources} />}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
              <span className="text-sm text-slate-500">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-white/5 p-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={hasDocuments ? `Ask about ${contextLabel}…` : "Upload a document first…"}
          disabled={!hasDocuments || isLoading}
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading || !hasDocuments}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
