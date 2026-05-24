import { Message } from "@/domain/message/Message";
import { TextMessage } from "@/domain/message/TextMessage";
import { FileMessage } from "@/domain/message/FileMessage";

export type ChatMessagePayload = {
  roomId?: string;
  id: string;
  senderId: string;
  createdAt: string;
  type: "text" | "file";
  content?: string;
  fileUrl?: string;
  fileName?: string;
};

export function messageToPayload(message: Message): ChatMessagePayload {
  if (message instanceof TextMessage) {
    return {
      id: message.id,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
      type: "text",
      content: message.content,
    };
  }

  if (message instanceof FileMessage) {
    return {
      id: message.id,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
      type: "file",
      fileUrl: message.fileUrl,
      fileName: message.fileName,
    };
  }

  throw new Error("Unsupported message type");
}

export function payloadToMessage(payload: ChatMessagePayload): Message {
  if (payload.type === "text") {
    return new TextMessage(
      payload.id,
      payload.senderId,
      new Date(payload.createdAt),
      payload.content ?? ""
    );
  }

  return new FileMessage(
    payload.id,
    payload.senderId,
    new Date(payload.createdAt),
    payload.fileUrl ?? "",
    payload.fileName ?? ""
  );
}

export function isChatMessagePayload(value: unknown): value is ChatMessagePayload {
  const candidate = unwrapBroadcastPayload(value);
  if (!candidate || typeof candidate !== "object") return false;
  const o = candidate as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.senderId === "string" &&
    typeof o.createdAt === "string" &&
    (o.type === "text" || o.type === "file")
  );
}

/** Supabase may deliver broadcast payload as a JSON string or nested object. */
export function unwrapBroadcastPayload(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  if (raw && typeof raw === "object" && "payload" in raw) {
    const nested = (raw as { payload: unknown }).payload;
    return typeof nested === "string" ? unwrapBroadcastPayload(nested) : nested;
  }
  return raw;
}
