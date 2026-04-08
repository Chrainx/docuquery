"use client";

import { useState, useEffect, useCallback } from "react";
import type { Document, ChatMessage } from "@/types";
import { listDocuments } from "@/lib/api";
import { UploadZone } from "@/components/UploadZone";
import { DocumentList } from "@/components/DocumentList";
import { ChatInterface } from "@/components/ChatInterface";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const refreshDocuments = useCallback(async () => {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  // Poll for processing documents.
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(refreshDocuments, 3000);
    return () => clearInterval(interval);
  }, [documents, refreshDocuments]);

  const readyDocuments = documents.filter((d) => d.status === "ready");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">
          Ask Your PDFs Anything
        </h1>
        <p className="mt-2 text-gray-600">
          Upload a PDF, ask questions in plain English, get answers with page
          citations.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column: Upload + Document list */}
        <div className="space-y-6 lg:col-span-1">
          <UploadZone onUploadComplete={refreshDocuments} />
          <DocumentList
            documents={documents}
            selectedId={selectedDocId}
            onSelect={setSelectedDocId}
            onDelete={refreshDocuments}
          />
        </div>

        {/* Right column: Chat */}
        <div className="lg:col-span-2">
          <ChatInterface
            documents={readyDocuments}
            selectedDocId={selectedDocId}
            onSelectDoc={setSelectedDocId}
            messages={messages}
            setMessages={setMessages}
          />
        </div>
      </div>
    </div>
  );
}
