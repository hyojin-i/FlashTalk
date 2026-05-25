import type { FileInfoDTO } from "@/entities/FileInfoDTO";
import { Message } from "./Message";
import { TextMessage } from "./TextMessage";
import { FileMessage } from "./FileMessage";

type FileMessagePayload = {
  id?: string;
  senderId?: string;
  createdAt?: Date;
  fileUrl: string;
  fileName: string;
  fileSize: number;
};

function parseFileMessagePayload(
  content: string | FileMessagePayload
): FileMessagePayload {
  if (typeof content === "object" && content !== null) {
    return content as FileMessagePayload;
  }

  const parsed = JSON.parse(content) as FileInfoDTO & FileMessagePayload;
  const fileUrl =
    typeof parsed.fileUrl === "string"
      ? parsed.fileUrl
      : typeof parsed.filePath === "string"
        ? parsed.filePath
        : "";

  if (!fileUrl || typeof parsed.fileName !== "string") {
    throw new Error("Invalid file message content");
  }

  return {
    fileUrl,
    fileName: parsed.fileName,
    fileSize:
      typeof parsed.fileSize === "number" && Number.isFinite(parsed.fileSize)
        ? parsed.fileSize
        : 0,
  };
}

export class MessageFactory {
  static createMessage(
    type: "text" | "file",
    content: string | FileMessagePayload,
    userId: string,
    _roomId: string
  ): Message {
    if (type === "text") {
      const textContent = typeof content === "string" ? content : "";
      return new TextMessage(
        crypto.randomUUID(),
        userId,
        new Date(),
        textContent
      );
    }

    if (type === "file") {
      const payload = parseFileMessagePayload(content);
      return new FileMessage(
        payload.id ?? crypto.randomUUID(),
        payload.senderId ?? userId,
        payload.createdAt ?? new Date(),
        payload.fileUrl,
        payload.fileName,
        payload.fileSize
      );
    }

    throw new Error("Unsupported message type");
  }
}
