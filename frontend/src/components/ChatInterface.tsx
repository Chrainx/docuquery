"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Loader2, Send } from "lucide-react";
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
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-900"
      >
        <span className="flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          {sources.length} source{sources.length !== 1 && "s"} cited
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-gray-200 px-3 py-2">
          {sources.map((src, i) => (
            <div key={i} className="text-xs">
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-flex items-center rounded bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-700">
                  Page {src.page_numbers.join(", ")}
                </span>
                <span className="text-gray-400">{(src.similarity_score * 100).toFixed(1)}% match</span>
                <span className="truncate text-gray-400">{src.filename}</span>
              </div>
              <p className="leading-relaxed text-gray-600">
                {src.content.length > 300 ? src.content.slice(0, 300) + "..." : src.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatInterface({
  documents,
  directories,
  selectedDocId,
  selectedDirectoryId,
  onSelectDoc,
  onSelectDirectory,
  messages,
  setMessages,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      timestamp: new Date(),
    };

    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);

    try {
      await queryDocumentStream(
        question,
        selectedDocId,
        selectedDirectoryId,
        5,
        (token: string) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: msg.content + token } : msg,
            ),
          );
        },
        (sources: SourceChunk[]) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, sources } : msg)),
          );
        },
        (error: string) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: `Sorry, something went wrong: ${error}` }
                : msg,
            ),
          );
        },
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content:
                  err instanceof Error
                    ? `Sorry, something went wrong: ${err.message}`
                    : "Sorry, an unexpected error occurred.",
              }
            : msg,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const hasDocuments = documents.length > 0;

  // Determine context label for placeholder
  const contextLabel = selectedDirectoryId
    ? (directories.find((d) => d.id === selectedDirectoryId)?.name ?? "directory")
    : selectedDocId
      ? (documents.find((d) => d.id === selectedDocId)?.filename ?? "document")
      : "all documents";

  return (
    <div className="flex h-[600px] flex-col rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Header with context selector */}
      <div className="mb-4 border-b border-gray-100 pb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Chat</h2>
        </div>

        {(hasDocuments || directories.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Document selector */}
            {hasDocuments && (
              <select
                value={selectedDocId || ""}
                onChange={(e) => {
                  onSelectDoc(e.target.value || undefined);
                  if (e.target.value) onSelectDirectory(null);
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Single doc: all</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.filename}
                  </option>
                ))}
              </select>
            )}

            {/* Directory selector */}
            {directories.length > 0 && (
              <select
                value={selectedDirectoryId || ""}
                onChange={(e) => {
                  onSelectDirectory(e.target.value || null);
                  if (e.target.value) onSelectDoc(undefined);
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Directory: all</option>
                {directories.map((dir) => (
                  <option key={dir.id} value={dir.id}>
                    📁 {dir.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-2">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <BookOpen className="mb-3 h-12 w-12 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">
              {hasDocuments ? "Ask a question about your documents" : "Upload a PDF to get started"}
            </p>
            {hasDocuments && (
              <p className="mt-1 text-xs text-gray-400">
                e.g., &ldquo;What are the main findings?&rdquo;
              </p>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === "user" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-900"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              {msg.sources && <SourcePanel sources={msg.sources} />}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-gray-100 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              <span className="text-sm text-gray-500">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="mt-4 flex gap-3 border-t border-gray-100 pt-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={hasDocuments ? `Ask about ${contextLabel}...` : "Upload a document first..."}
          disabled={!hasDocuments || isLoading}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:cursor-not-allowed disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading || !hasDocuments}
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
