"use client";

import { X } from "lucide-react";

interface PdfViewerProps {
  docId: string;
  filename: string;
  page?: number;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

export function PdfViewer({ docId, filename, page, onClose }: PdfViewerProps) {
  const src = `${API_BASE}/documents/${docId}/file${page ? `#page=${page}` : ""}`;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-300">{filename}</p>
          {page && <p className="text-xs text-slate-500">Page {page}</p>}
        </div>
        <button
          onClick={onClose}
          className="ml-3 shrink-0 rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/10 hover:text-slate-300"
          title="Close viewer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* PDF iframe */}
      <iframe
        key={src}
        src={src}
        className="min-h-0 flex-1 w-full"
        title={filename}
      />
    </div>
  );
}
