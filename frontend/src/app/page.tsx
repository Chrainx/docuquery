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

  const refreshDocuments = useCallback(async () => {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  }, []);

  const refreshDirectories = useCallback(async () => {
    try {
      const dirs = await listDirectories();
      setDirectories(dirs);
    } catch (err) {
      console.error("Failed to fetch directories:", err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshDocuments(), refreshDirectories()]);
  }, [refreshDocuments, refreshDirectories]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Poll for processing documents.
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing");
    if (!hasProcessing) return;
    const interval = setInterval(refreshDocuments, 3000);
    return () => clearInterval(interval);
  }, [documents, refreshDocuments]);

  // Filter documents by selected directory for the document list.
  const visibleDocuments =
    selectedDirectoryId
      ? documents.filter((d) => d.directory_id === selectedDirectoryId)
      : documents;

  const readyDocuments = documents.filter((d) => d.status === "ready");

  // When a directory is selected, clear any single-doc selection.
  const handleSelectDirectory = (id: string | null) => {
    setSelectedDirectoryId(id);
    setSelectedDocId(undefined);
  };

  // When a doc is selected, clear directory context from chat.
  const handleSelectDoc = (id: string | undefined) => {
    setSelectedDocId(id);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Ask Your PDFs Anything</h1>
        <p className="mt-2 text-gray-600">
          Upload a PDF, ask questions in plain English, get answers with page citations.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Left column: Directories */}
        <div className="lg:col-span-1">
          <DirectoryList
            selectedDirectoryId={selectedDirectoryId}
            onSelectDirectory={handleSelectDirectory}
            onDirectoriesChange={refreshAll}
          />
        </div>

        {/* Middle column: Upload + Document list */}
        <div className="space-y-6 lg:col-span-1">
          <UploadZone
            onUploadComplete={refreshAll}
            activeDirectoryId={selectedDirectoryId ?? undefined}
          />
          <DocumentList
            documents={visibleDocuments}
            directories={directories}
            selectedId={selectedDocId}
            onSelect={handleSelectDoc}
            onDelete={refreshAll}
            onAssign={refreshAll}
          />
        </div>

        {/* Right column: Chat */}
        <div className="lg:col-span-2">
          <ChatInterface
            documents={readyDocuments}
            directories={directories}
            selectedDocId={selectedDocId}
            selectedDirectoryId={selectedDirectoryId ?? undefined}
            onSelectDoc={handleSelectDoc}
            onSelectDirectory={handleSelectDirectory}
            messages={messages}
            setMessages={setMessages}
          />
        </div>
      </div>
    </div>
  );
}
