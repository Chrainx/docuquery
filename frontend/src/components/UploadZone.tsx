"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { uploadDocument } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface UploadZoneProps {
  onUploadComplete: () => void;
  activeDirectoryId?: string;
}

export function UploadZone({ onUploadComplete, activeDirectoryId }: UploadZoneProps) {
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) { setError("Please upload a PDF file."); return; }
    if (file.size > 50 * 1024 * 1024) { setError("File must be under 50 MB."); return; }
    setIsUploading(true);
    try {
      await uploadDocument(file, activeDirectoryId);
      addToast("success", `"${file.name}" uploaded — processing now.`);
      onUploadComplete();
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setError(msg); addToast("error", msg);
    } finally { setIsUploading(false); }
  }, [onUploadComplete, activeDirectoryId, addToast]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Toggle row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/20">
          <Upload className="h-3.5 w-3.5 text-brand-400" />
        </div>
        <span className="flex-1 text-sm font-medium text-slate-300">Upload PDF</span>
        {open
          ? <ChevronUp className="h-4 w-4 text-slate-600" />
          : <ChevronDown className="h-4 w-4 text-slate-600" />}
      </button>

      {/* Expandable drop zone */}
      {open && (
        <div className="border-t border-white/5 p-3">
          <div
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-all ${
              isDragging
                ? "border-brand-400 bg-brand-500/10"
                : "border-white/10 hover:border-brand-500/40 hover:bg-brand-500/5"
            } ${isUploading ? "pointer-events-none" : ""}`}
          >
            {isUploading ? (
              <>
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                <p className="text-xs text-slate-400">Uploading…</p>
              </>
            ) : (
              <>
                <Upload className={`h-6 w-6 ${isDragging ? "text-brand-400" : "text-slate-600"}`} />
                <p className={`text-xs font-medium ${isDragging ? "text-brand-300" : "text-slate-400"}`}>
                  {isDragging ? "Drop to upload" : "Drop a PDF or click to browse"}
                </p>
                <p className="text-[10px] text-slate-600">Up to 50 MB</p>
              </>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

          {error && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
