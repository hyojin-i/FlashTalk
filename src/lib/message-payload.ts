import { Message } from "@/domain/message/Message";
import { SystemMessage } from "@/domain/message/SystemMessage";
import type { SystemActionType as DomainSystemActionType } from "@/domain/message/SystemMessage";
import { TextMessage } from "@/domain/message/TextMessage";
import { FileMessage } from "@/domain/message/FileMessage";

export type SystemActionType = DomainSystemActionType;

export type ChatMessagePayload = {
  roomId?: string;
  id: string;
  senderId: string;
  createdAt: string;
  type: "text" | "file" | "system";
  content?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  actionType?: SystemActionType;
  leftUserId?: string;
  leftUserName?: string;
  remainingCount?: number;
  /** User who joined via INVITE / JOIN (for participant list sync on other clients). */
  membershipUserId?: string;
  membershipUserName?: string;
  membershipStudentId?: string;
};

export function systemMessageToPayload(
  message: SystemMessage,
  roomId?: string
): ChatMessagePayload {
  const { actionType, content } = message.getContent();
  return {
    id: message.id,
    senderId: "",
    createdAt: message.createdAt.toISOString(),
    type: "system",
    content,
    actionType,
    roomId: roomId?.trim(),
  };
}

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
      fileSize: message.fileSize,
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

  if (payload.type === "file") {
    return new FileMessage(
      payload.id,
      payload.senderId,
      new Date(payload.createdAt),
      payload.fileUrl ?? "",
      payload.fileName ?? "",
      payload.fileSize ?? 0
    );
  }

  throw new Error("Unsupported message type");
}

export function isSystemMessagePayload(
  value: unknown
): value is ChatMessagePayload {
  const candidate = unwrapBroadcastPayload(value);
  if (!candidate || typeof candidate !== "object") return false;
  const o = candidate as Record<string, unknown>;
  return (
    o.type === "system" &&
    typeof o.id === "string" &&
    typeof o.createdAt === "string" &&
    typeof o.content === "string"
  );
}

export function isChatMessagePayload(
  value: unknown
): value is ChatMessagePayload {
  if (isSystemMessagePayload(value)) return true;

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
