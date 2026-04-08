"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { uploadDocument } from "@/lib/api";
import { useToast } from "@/components/Toast";

interface UploadZoneProps {
  onUploadComplete: () => void;
}

export function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Please upload a PDF file.");
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        setError("File must be under 50 MB.");
        return;
      }

      setIsUploading(true);
      try {
        await uploadDocument(file);
        addToast("success", `"${file.name}" uploaded — processing now.`);
        onUploadComplete();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed.";
        setError(msg);
        addToast("error", msg);
      } finally {
        setIsUploading(false);
      }
    },
    [onUploadComplete],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="card">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Upload PDF
      </h2>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? "border-brand-500 bg-brand-50"
            : "border-gray-300 hover:border-gray-400"
        } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
      >
        {isUploading ? (
          <>
            <div className="mb-2 h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            <p className="text-sm text-gray-600">Uploading...</p>
          </>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">
              Drop a PDF here or click to browse
            </p>
            <p className="mt-1 text-xs text-gray-500">PDF up to 50 MB</p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
