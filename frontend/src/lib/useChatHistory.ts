import { useCallback, useEffect, useState } from "react";
import type { ChatMessage } from "@/types";

const STORAGE_KEY = "docuquery:chat:";
const MAX_MESSAGES = 100;

function contextKey(docId?: string, directoryId?: string): string {
  if (docId) return `doc:${docId}`;
  if (directoryId) return `dir:${directoryId}`;
  return "all";
}

function loadMessages(key: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<ChatMessage, "timestamp"> & { timestamp: string }>;
    return parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function saveMessages(key: string, messages: ChatMessage[]) {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(STORAGE_KEY + key, JSON.stringify(trimmed));
  } catch {
    // localStorage may be full or unavailable — silently ignore
  }
}

export function useChatHistory(selectedDocId?: string, selectedDirectoryId?: string | null) {
  const key = contextKey(selectedDocId, selectedDirectoryId ?? undefined);

  const [messages, setMessagesState] = useState<ChatMessage[]>(() => loadMessages(key));

  // When context changes, load the stored history for the new context
  useEffect(() => {
    setMessagesState(loadMessages(key));
  }, [key]);

  // Persist to localStorage whenever messages change
  useEffect(() => {
    saveMessages(key, messages);
  }, [key, messages]);

  const setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> = useCallback(
    (action) => {
      setMessagesState((prev) => {
        const next = typeof action === "function" ? action(prev) : action;
        return next;
      });
    },
    [],
  );

  const clearHistory = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY + key);
    setMessagesState([]);
  }, [key]);

  return { messages, setMessages, clearHistory };
}
