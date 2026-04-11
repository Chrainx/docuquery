"use client";

import { useEffect, useState } from "react";
import { Check, Folder, FolderOpen, Layers, Pencil, Plus, Trash2, X } from "lucide-react";
import { assignDocumentToDirectory, createDirectory, deleteDirectory, listDirectories, updateDirectory } from "@/lib/api";
import type { Directory } from "@/types";

interface DirectoryListProps {
  selectedDirectoryId: string | null;
  onSelectDirectory: (id: string | null) => void;
  onDirectoriesChange?: () => void;
  isDragging?: boolean;
}

export default function DirectoryList({
  selectedDirectoryId,
  onSelectDirectory,
  onDirectoriesChange,
  isDragging = false,
}: DirectoryListProps) {
  const [directories, setDirectories] = useState<Directory[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchDirectories = async () => {
    try {
      setDirectories(await listDirectories());
    } catch { /* ignore */ } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectories();
    const t = setInterval(fetchDirectories, 5000);
    return () => clearInterval(t);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createDirectory(newName.trim(), newDescription.trim() || undefined);
      setNewName(""); setNewDescription(""); setIsCreating(false);
      await fetchDirectories();
      onDirectoriesChange?.();
    } catch { /* ignore */ }
  };

  const startEdit = (dir: Directory, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(dir.id);
    setEditName(dir.name);
  };

  const commitEdit = async (dir: Directory) => {
    const name = editName.trim();
    if (!name || name === dir.name) { setEditingId(null); return; }
    try {
      await updateDirectory(dir.id, name, dir.description);
      await fetchDirectories();
      onDirectoriesChange?.();
    } catch { /* ignore */ }
    setEditingId(null);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this directory? Documents inside will not be deleted.")) return;
    try {
      await deleteDirectory(id);
      if (selectedDirectoryId === id) onSelectDirectory(null);
      await fetchDirectories();
      onDirectoriesChange?.();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Directories
            </span>
          </div>
          <button
            onClick={() => setIsCreating((v) => !v)}
            className={`rounded-lg p-1.5 transition-all ${
              isCreating
                ? "bg-white/10 text-white"
                : "text-slate-500 hover:bg-white/10 hover:text-white"
            }`}
          >
            {isCreating ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </div>

        {isCreating && (
          <form onSubmit={handleCreate} className="mb-3 space-y-2">
            <input
              autoFocus
              type="text"
              placeholder="Directory name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-500 disabled:opacity-40"
            >
              Create
            </button>
          </form>
        )}

        {/* All documents */}
        <button
          onClick={() => onSelectDirectory(null)}
          className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
            selectedDirectoryId === null
              ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <Folder className="h-4 w-4" />
          <span className="flex-1 text-left">All documents</span>
        </button>
      </div>

      {/* Directory list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : directories.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-slate-600">
          No directories yet.<br />Create one to group your PDFs.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {directories.map((dir) => {
            const isSelected = selectedDirectoryId === dir.id;
            const isDragOver = dragOverId === dir.id;
            return (
              <li
                key={dir.id}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverId(dir.id); }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null);
                }}
                onDrop={async (e) => {
                  e.preventDefault(); e.stopPropagation();
                  const docId = e.dataTransfer.getData("docId");
                  setDragOverId(null);
                  if (docId) { await assignDocumentToDirectory(docId, dir.id); onDirectoriesChange?.(); }
                }}
                className={`group rounded-xl transition-all ${isDragOver ? "ring-2 ring-brand-400/60" : ""}`}
              >
                <button
                  onClick={() => onSelectDirectory(dir.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    isDragOver
                      ? "bg-brand-500/20 text-brand-300"
                      : isSelected
                        ? "bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40"
                        : isDragging
                          ? "border border-dashed border-brand-500/30 text-slate-400 hover:bg-brand-500/10 hover:text-brand-300"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {isSelected || isDragOver
                    ? <FolderOpen className="h-4 w-4 text-brand-400 shrink-0" />
                    : <Folder className="h-4 w-4 shrink-0" />}

                  {editingId === dir.id ? (
                    /* Inline edit mode */
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(dir);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => commitEdit(dir)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 rounded bg-white/10 px-1 py-0.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  ) : (
                    <span className="flex-1 truncate text-left">{dir.name}</span>
                  )}

                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    isSelected ? "bg-brand-500/30 text-brand-300" : "bg-white/5 text-slate-500"
                  }`}>
                    {dir.document_count}
                  </span>
                  <span
                    role="button"
                    onClick={(e) => startEdit(dir, e)}
                    className="hidden rounded p-0.5 text-slate-600 transition-colors hover:text-slate-300 group-hover:block"
                    title="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                  <span
                    role="button"
                    onClick={(e) => handleDelete(dir.id, e)}
                    className="hidden rounded p-0.5 text-slate-600 transition-colors hover:text-red-400 group-hover:block"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
