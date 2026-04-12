"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, AlertCircle, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, X } from "lucide-react";
import { subscribeToDocumentProgress, uploadDocument } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface UploadZoneProps {
  onUploadComplete: () => void;
  activeDirectoryId?: string;
}

interface FileUploadState {
  file: File;
  status: "pending" | "uploading" | "processing" | "done" | "error";
  stage?: string; // e.g. "Parsing PDF…", "Generating embeddings…"
  error?: string;
}

export function UploadZone({ onUploadComplete, activeDirectoryId }: UploadZoneProps) {
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [queue, setQueue] = useState<FileUploadState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();
  const isUploading = queue.some((f) => f.status === "uploading" || f.status === "pending" || f.status === "processing");

  const processQueue = useCallback(async (files: FileUploadState[], directoryId?: string) => {
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      if (item.status !== "pending") continue;

      setQueue((prev) => prev.map((f) => f.file === item.file ? { ...f, status: "uploading" } : f));

      try {
        const result = await uploadDocument(item.file, directoryId);
        onUploadComplete(); // refresh doc list (shows "processing" badge)

        // Subscribe to backend progress events.
        setQueue((prev) => prev.map((f) =>
          f.file === item.file ? { ...f, status: "processing", stage: "Parsing PDF…" } : f
        ));

        await new Promise<void>((resolve) => {
          const unsub = subscribeToDocumentProgress(result.id, (event) => {
            if (event.stage === "ready") {
              setQueue((prev) => prev.map((f) =>
                f.file === item.file ? { ...f, status: "done", stage: undefined } : f
              ));
              onUploadComplete(); // refresh to show "ready" badge
              resolve();
            } else if (event.stage === "error") {
              setQueue((prev) => prev.map((f) =>
                f.file === item.file ? { ...f, status: "error", error: event.message } : f
              ));
              resolve();
            } else {
              setQueue((prev) => prev.map((f) =>
                f.file === item.file ? { ...f, stage: event.message } : f
              ));
            }
          });
          // Resolve after 60s max in case SSE never fires (e.g. browser blocks EventSource).
          setTimeout(() => { unsub(); resolve(); }, 60_000);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed.";
        setQueue((prev) => prev.map((f) => f.file === item.file ? { ...f, status: "error", error: msg } : f));
        addToast("error", `Failed to upload "${item.file.name}": ${msg}`);
      }
    }
  }, [onUploadComplete, addToast]);

  const handleFiles = useCallback((rawFiles: File[]) => {
    const valid: FileUploadState[] = [];
    const invalid: string[] = [];

    for (const file of rawFiles) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        invalid.push(`${file.name} (not a PDF)`);
      } else if (file.size > 50 * 1024 * 1024) {
        invalid.push(`${file.name} (exceeds 50 MB)`);
      } else {
        valid.push({ file, status: "pending" });
      }
    }

    if (invalid.length > 0) {
      addToast("error", `Skipped: ${invalid.join(", ")}`);
    }

    if (valid.length === 0) return;

    setQueue((prev) => [...prev, ...valid]);
    processQueue(valid, activeDirectoryId);
  }, [activeDirectoryId, addToast, processQueue]);

  const clearDone = () => setQueue((prev) => prev.filter((f) => f.status !== "done" && f.status !== "error"));

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Toggle row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/20">
          {isUploading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
            : <Upload className="h-3.5 w-3.5 text-brand-400" />}
        </div>
        <span className="flex-1 text-sm font-medium text-slate-300">
          Upload PDF
          {isUploading && <span className="ml-2 text-xs text-slate-500">Uploading…</span>}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-600" /> : <ChevronDown className="h-4 w-4 text-slate-600" />}
      </button>

      {open && (
        <div className="border-t border-white/5 p-3 space-y-3">
          {/* Drop zone */}
          <div
            onDrop={(e) => {
              e.preventDefault(); setIsDragging(false);
              handleFiles(Array.from(e.dataTransfer.files));
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-all ${
              isDragging ? "border-brand-400 bg-brand-500/10" : "border-white/10 hover:border-brand-500/40 hover:bg-brand-500/5"
            }`}
          >
            <Upload className={`h-6 w-6 ${isDragging ? "text-brand-400" : "text-slate-600"}`} />
            <div>
              <p className={`text-xs font-medium ${isDragging ? "text-brand-300" : "text-slate-400"}`}>
                {isDragging ? "Drop to upload" : "Drop PDFs or click to browse"}
              </p>
              <p className="text-[10px] text-slate-600">Multiple files supported · up to 50 MB each</p>
            </div>
          </div>

          <input
            ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden"
            onChange={(e) => { handleFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />

          {/* Queue */}
          {queue.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Files</span>
                {queue.some((f) => f.status === "done" || f.status === "error") && (
                  <button onClick={clearDone} className="text-[10px] text-slate-600 hover:text-slate-400">Clear done</button>
                )}
              </div>
              {queue.map((item, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-2">
                  {(item.status === "uploading" || item.status === "processing") && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-400" />
                  )}
                  {item.status === "pending" && <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-600" />}
                  {item.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                  {item.status === "error" && <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-slate-300">{item.file.name}</span>
                    {item.status === "processing" && item.stage && (
                      <span className="text-[10px] text-slate-500">{item.stage}</span>
                    )}
                    {item.status === "error" && item.error && (
                      <span className="text-[10px] text-red-400">{item.error}</span>
                    )}
                  </div>
                  {(item.status === "done" || item.status === "error") && (
                    <button onClick={() => setQueue((prev) => prev.filter((_, j) => j !== i))} className="shrink-0 text-slate-700 hover:text-slate-400">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
