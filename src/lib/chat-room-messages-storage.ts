import type { ChatMessagePayload } from "@/lib/message-payload";
import { isChatMessagePayload } from "@/lib/message-payload";

/** Procedure step 13.1: `chat_history_{roomId}` */
export function chatHistoryStorageKey(roomId: string): string {
  return `chat_history_${roomId.trim()}`;
}

export function readRoomMessages(roomId: string): ChatMessagePayload[] {
  try {
    const raw = sessionStorage.getItem(chatHistoryStorageKey(roomId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMessagePayload);
  } catch {
    return [];
  }
}

/** Procedure steps 13.1–13.3: parse, merge, stringify, save. */
export function appendRoomMessage(
  roomId: string,
  message: ChatMessagePayload
): void {
  const key = chatHistoryStorageKey(roomId);
  let existing: ChatMessagePayload[] = [];
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        existing = parsed.filter(isChatMessagePayload);
      }
    }
  } catch {
    existing = [];
  }

  if (existing.some((m) => m.id === message.id)) return;

  sessionStorage.setItem(key, JSON.stringify([...existing, message]));
}
