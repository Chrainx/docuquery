"use client";

import { CheckCircle2, FileText, Loader2, Trash2, XCircle } from "lucide-react";
import { assignDocumentToDirectory, deleteDocument } from "@/lib/api";
import type { Directory, Document } from "@/types";

interface DocumentListProps {
  documents: Document[];
  directories: Directory[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onDelete: () => void;
  onAssign: () => void;
}

const statusConfig = {
  processing: {
    icon: Loader2,
    className: "text-yellow-600 animate-spin",
    label: "Processing",
    badge: "bg-yellow-100 text-yellow-700",
  },
  ready: {
    icon: CheckCircle2,
    className: "text-green-600",
    label: "Ready",
    badge: "bg-green-100 text-green-700",
  },
  error: {
    icon: XCircle,
    className: "text-red-600",
    label: "Error",
    badge: "bg-red-100 text-red-700",
  },
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({
  documents,
  directories,
  selectedId,
  onSelect,
  onDelete,
  onAssign,
}: DocumentListProps) {
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this document and all its data?")) return;
    try {
      await deleteDocument(id);
      if (selectedId === id) onSelect(undefined);
      onDelete();
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const handleAssign = async (e: React.ChangeEvent<HTMLSelectElement>, docId: string) => {
    e.stopPropagation();
    const value = e.target.value;
    try {
      await assignDocumentToDirectory(docId, value || null);
      onAssign();
    } catch (err) {
      console.error("Failed to assign directory:", err);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Documents
        </h2>
        <p className="py-4 text-center text-sm text-gray-400">No documents uploaded yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Documents</h2>
        {selectedId && (
          <button
            onClick={() => onSelect(undefined)}
            className="text-xs text-brand-600 hover:text-brand-700"
          >
            Search all
          </button>
        )}
      </div>
      <div className="space-y-2">
        {documents.map((doc) => {
          const status = statusConfig[doc.status];
          const StatusIcon = status.icon;
          const isSelected = selectedId === doc.id;

          return (
            <div
              key={doc.id}
              onClick={() =>
                doc.status === "ready" ? onSelect(isSelected ? undefined : doc.id) : undefined
              }
              className={`flex items-start gap-3 rounded-lg p-3 transition-colors ${
                doc.status === "ready" ? "cursor-pointer hover:bg-gray-50" : "opacity-60"
              } ${isSelected ? "bg-brand-50 ring-1 ring-brand-200" : ""}`}
            >
              <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{doc.filename}</p>
                <p className="text-xs text-gray-500">
                  {doc.page_count} pages · {formatBytes(doc.file_size_bytes)}
                  {doc.chunk_count > 0 && ` · ${doc.chunk_count} chunks`}
                </p>
                {directories.length > 0 && (
                  <select
                    value={doc.directory_id || ""}
                    onChange={(e) => handleAssign(e, doc.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">No directory</option>
                    {directories.map((dir) => (
                      <option key={dir.id} value={dir.id}>
                        {dir.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.badge}`}
                >
                  <StatusIcon className={`h-3 w-3 ${status.className}`} />
                  {status.label}
                </span>
                <button
                  onClick={(e) => handleDelete(e, doc.id)}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
