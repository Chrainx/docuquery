"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, Directory, Document } from "@/types";
import { listDirectories, listDocuments } from "@/lib/api";
import { ChatInterface } from "@/components/ChatInterface";
import DirectoryList from "@/components/DirectoryList";
import { DocumentList } from "@/components/DocumentList";
import { UploadZone } from "@/components/UploadZone";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [directories, setDirectories] = useState<Directory[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>();
  const [selectedDirectoryId, setSelectedDirectoryId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draggingDocId, setDraggingDocId] = useState<string | undefined>();

  const refreshDocuments = useCallback(async () => {
    try { setDocuments(await listDocuments()); } catch { /* ignore */ }
  }, []);

  const refreshDirectories = useCallback(async () => {
    try { setDirectories(await listDirectories()); } catch { /* ignore */ }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshDocuments(), refreshDirectories()]);
  }, [refreshDocuments, refreshDirectories]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(refreshDocuments, 3000);
    return () => clearInterval(interval);
  }, [documents, refreshDocuments]);

  const visibleDocuments = selectedDirectoryId
    ? documents.filter((d) => d.directory_id === selectedDirectoryId)
    : documents;

  const readyDocuments = documents.filter((d) => d.status === "ready");

  const handleSelectDirectory = (id: string | null) => {
    setSelectedDirectoryId(id);
    setSelectedDocId(undefined);
  };

  return (
    /* Full viewport minus the 56px header, no page-level scroll */
    <div className="relative flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-slate-950">
      {/* Background */}
      <div className="absolute inset-0 bg-grid-slate bg-grid opacity-100" />
      <div className="pointer-events-none absolute inset-0 flex justify-center">
        <div className="h-[300px] w-[700px] rounded-full bg-brand-600/10 blur-[100px]" />
      </div>

      {/* Hero — compact, no wasted space */}
      <div className="relative shrink-0 py-5 text-center">
        <h1 className="bg-gradient-to-br from-white to-slate-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
          Ask your PDFs anything
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload documents, organise into directories, and get cited answers — 100% local &amp; free.
        </p>
      </div>

      {/* 3-column layout — each column scrolls independently */}
      <div className="relative flex min-h-0 flex-1 gap-4 px-6 pb-6">
        {/* Col 1: Directories */}
        <div className="w-[200px] shrink-0 overflow-y-auto">
          <DirectoryList
            selectedDirectoryId={selectedDirectoryId}
            onSelectDirectory={handleSelectDirectory}
            onDirectoriesChange={refreshAll}
            isDragging={!!draggingDocId}
          />
        </div>

        {/* Col 2: Upload + Documents */}
        <div className="flex w-[260px] shrink-0 flex-col gap-4 overflow-hidden">
          {/* Upload stays pinned at top */}
          <div className="shrink-0">
            <UploadZone
              onUploadComplete={refreshAll}
              activeDirectoryId={selectedDirectoryId ?? undefined}
            />
          </div>
          {/* Documents — card handles its own internal scroll */}
          <div className="min-h-0 flex-1">
            <DocumentList
              documents={visibleDocuments}
              directories={directories}
              selectedId={selectedDocId}
              onSelect={setSelectedDocId}
              onDelete={refreshAll}
              onAssign={refreshAll}
              onDragStart={(id) => setDraggingDocId(id)}
              onDragEnd={() => setDraggingDocId(undefined)}
            />
          </div>
        </div>

        {/* Col 3: Chat — fills remaining width */}
        <div className="min-w-0 flex-1">
          <ChatInterface
            documents={readyDocuments}
            directories={directories}
            selectedDocId={selectedDocId}
            selectedDirectoryId={selectedDirectoryId ?? undefined}
            onSelectDoc={setSelectedDocId}
            onSelectDirectory={handleSelectDirectory}
            messages={messages}
            setMessages={setMessages}
          />
        </div>
      </div>
    </div>
  );
}
