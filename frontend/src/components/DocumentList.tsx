"use client";

import { useState } from "react";
import { CheckCircle2, FileText, GripVertical, Loader2, Pencil, Search, Trash2, X, XCircle } from "lucide-react";
import { assignDocumentToDirectory, deleteDocument, renameDocument } from "@/lib/api";
import type { Directory, Document } from "@/types";

interface DocumentListProps {
  documents: Document[];
  directories: Directory[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  onDelete: () => void;
  onAssign: () => void;
  onDragStart: (docId: string) => void;
  onDragEnd: () => void;
}

const statusConfig = {
  processing: {
    icon: Loader2,
    iconClass: "text-amber-400 animate-spin",
    badge: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20",
    label: "Processing",
  },
  ready: {
    icon: CheckCircle2,
    iconClass: "text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20",
    label: "Ready",
  },
  error: {
    icon: XCircle,
    iconClass: "text-red-400",
    badge: "bg-red-500/10 text-red-400 ring-1 ring-red-500/20",
    label: "Error",
  },
} as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ documents, directories, selectedId, onSelect, onDelete, onAssign, onDragStart, onDragEnd }: DocumentListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "processing" | "error">("all");

  const filtered = documents.filter((doc) => {
    const matchesSearch = doc.filename.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || doc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const startRename = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    setEditingId(doc.id);
    setEditName(doc.display_name || doc.filename);
  };

  const commitRename = async (doc: Document) => {
    const name = editName.trim();
    setEditingId(null);
    if (!name || name === (doc.display_name || doc.filename)) return;
    try {
      await renameDocument(doc.id, name);
      onAssign(); // reuse refresh callback
    } catch (err) {
      console.error("Failed to rename:", err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this document and all its data?")) return;
    try { await deleteDocument(id); if (selectedId === id) onSelect(undefined); onDelete(); }
    catch (err) { console.error(err); }
  };

  const handleAssign = async (e: React.ChangeEvent<HTMLSelectElement>, docId: string) => {
    e.stopPropagation();
    try { await assignDocumentToDirectory(docId, e.target.value || null); onAssign(); }
    catch (err) { console.error(err); }
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Documents</span>
            {documents.length > 0 && (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                {filtered.length}/{documents.length}
              </span>
            )}
          </div>
          {selectedId && (
            <button onClick={() => onSelect(undefined)} className="text-xs text-brand-400 hover:text-brand-300">
              Clear
            </button>
          )}
        </div>

        {documents.length > 0 && (
          <div className="mt-2.5 space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-8 pr-7 text-xs text-slate-300 placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {/* Status filter */}
            <div className="flex gap-1">
              {(["all", "ready", "processing", "error"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-all ${
                    statusFilter === s
                      ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/30"
                      : "text-slate-600 hover:text-slate-400"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {documents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-slate-700" />
          <p className="text-sm text-slate-600">No documents here yet.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center">
          <Search className="mx-auto mb-2 h-6 w-6 text-slate-700" />
          <p className="text-xs text-slate-600">No documents match your search.</p>
          <button onClick={() => { setSearch(""); setStatusFilter("all"); }} className="mt-2 text-xs text-brand-400 hover:text-brand-300">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 divide-y divide-white/5 overflow-y-auto p-2">
          {filtered.map((doc) => {
            const status = statusConfig[doc.status];
            const StatusIcon = status.icon;
            const isSelected = selectedId === doc.id;
            const isDragging = draggingId === doc.id;

            return (
              <div
                key={doc.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("docId", doc.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingId(doc.id);
                  onDragStart(doc.id);
                }}
                onDragEnd={() => { setDraggingId(null); onDragEnd(); }}
                onClick={() => doc.status === "ready" && onSelect(isSelected ? undefined : doc.id)}
                className={`group flex items-start gap-2 rounded-xl p-2.5 transition-all ${
                  isDragging ? "opacity-30 ring-1 ring-brand-400/40" : ""
                } ${isSelected ? "bg-brand-500/10 ring-1 ring-brand-500/20" : "hover:bg-white/5"} ${
                  doc.status !== "ready" ? "opacity-60" : "cursor-pointer"
                }`}
              >
                <div className="mt-0.5 cursor-grab text-slate-700 active:cursor-grabbing">
                  <GripVertical className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  {editingId === doc.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(doc);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => commitRename(doc)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded bg-white/10 px-1.5 py-0.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  ) : (
                    <div className="flex items-center gap-1 group/name">
                      <p className={`truncate text-sm font-medium ${isSelected ? "text-brand-300" : "text-slate-200"}`}>
                        {doc.display_name || doc.filename}
                      </p>
                      {doc.display_name && (
                        <span className="shrink-0 text-[10px] text-slate-600 truncate">({doc.filename})</span>
                      )}
                      <button
                        onClick={(e) => startRename(e, doc)}
                        className="ml-0.5 shrink-0 text-slate-700 opacity-0 transition-opacity hover:text-slate-400 group-hover/name:opacity-100"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <p className="mt-0.5 text-xs text-slate-600">
                    {doc.page_count}p · {formatBytes(doc.file_size_bytes)}
                    {doc.chunk_count > 0 && ` · ${doc.chunk_count} chunks`}
                  </p>
                  {directories.length > 0 && (
                    <select
                      value={doc.directory_id || ""}
                      onChange={(e) => handleAssign(e, doc.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">No directory</option>
                      {directories.map((dir) => (
                        <option key={dir.id} value={dir.id}>{dir.name}</option>
                      ))}
                    </select>
                  )}
                </div> {/* min-w-0 flex-1 */}
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.badge}`}>
                    <StatusIcon className={`h-3 w-3 ${status.iconClass}`} />
                    {status.label}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, doc.id)}
                    className="rounded-lg p-1 text-slate-700 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {documents.length > 0 && (
        <p className="border-t border-white/5 px-4 py-2 text-center text-[10px] text-slate-700">
          Drag onto a directory to assign
        </p>
      )}
    </div>
  );
}
