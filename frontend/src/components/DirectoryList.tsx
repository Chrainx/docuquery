"use client";

import { useEffect, useState } from "react";
import { Folder, FolderOpen, Plus, Trash2, X } from "lucide-react";
import { createDirectory, deleteDirectory, listDirectories } from "@/lib/api";
import type { Directory } from "@/types";

interface DirectoryListProps {
  selectedDirectoryId: string | null;
  onSelectDirectory: (id: string | null) => void;
  onDirectoriesChange?: () => void;
}

export default function DirectoryList({
  selectedDirectoryId,
  onSelectDirectory,
  onDirectoriesChange,
}: DirectoryListProps) {
  const [directories, setDirectories] = useState<Directory[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchDirectories = async () => {
    try {
      const dirs = await listDirectories();
      setDirectories(dirs);
    } catch (_e) {
      // Silently fail — directories are optional
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectories();
    const interval = setInterval(fetchDirectories, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createDirectory(newName.trim(), newDescription.trim() || undefined);
      setNewName("");
      setNewDescription("");
      setIsCreating(false);
      await fetchDirectories();
      onDirectoriesChange?.();
    } catch (_e) {
      // ignore
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this directory? Documents inside will not be deleted.")) return;
    try {
      await deleteDirectory(id);
      if (selectedDirectoryId === id) onSelectDirectory(null);
      await fetchDirectories();
      onDirectoriesChange?.();
    } catch (_e) {
      // ignore
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Directories
        </h2>
        <button
          onClick={() => setIsCreating((v) => !v)}
          className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          title="New directory"
        >
          {isCreating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="mb-3 space-y-2">
          <input
            type="text"
            placeholder="Directory name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            autoFocus
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="w-full rounded-lg bg-brand-600 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create
          </button>
        </form>
      )}

      {/* "All documents" option */}
      <button
        onClick={() => onSelectDirectory(null)}
        className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
          selectedDirectoryId === null
            ? "bg-brand-50 font-medium text-brand-700"
            : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <Folder className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">All documents</span>
      </button>

      {isLoading ? (
        <div className="space-y-1 py-1">
          {[1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : directories.length === 0 ? (
        <p className="px-3 py-2 text-xs text-gray-400">No directories yet</p>
      ) : (
        <ul className="space-y-0.5">
          {directories.map((dir) => {
            const isSelected = selectedDirectoryId === dir.id;
            return (
              <li key={dir.id}>
                <button
                  onClick={() => onSelectDirectory(dir.id)}
                  className={`group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-brand-50 font-medium text-brand-700"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {isSelected ? (
                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <Folder className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="flex-1 truncate">{dir.name}</span>
                  <span className="text-xs text-gray-400">{dir.document_count}</span>
                  <button
                    onClick={(e) => handleDelete(dir.id, e)}
                    className="hidden rounded p-0.5 text-gray-400 transition-colors hover:text-red-500 group-hover:block"
                    title="Delete directory"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
