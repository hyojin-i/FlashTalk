import type { FileInfoDTO } from "@/entities/FileInfoDTO";
import { Message } from "./Message";
import { SystemMessage, type SystemActionType } from "./SystemMessage";
import { TextMessage } from "./TextMessage";
import { FileMessage } from "./FileMessage";
import { MapMessage } from "./MapMessage";
import { AiMessage } from "./AiMessage";

type FileMessagePayload = {
  id?: string;
  senderId?: string;
  createdAt?: Date;
  fileUrl: string;
  fileName: string;
  fileSize: number;
};

type MapMessagePayload = {
  id?: string;
  senderId?: string;
  createdAt?: Date;
  placeName: string;
  address: string;
  latitude: number;
  longitude: number;
  mapImageUrl: string;
  distanceFromSender?: number;
};

export interface AiMessagePayload {
    prompt: string; 
    response: string; 
    model: string; 
}

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

function parseMapMessagePayload(content: string | MapMessagePayload): MapMessagePayload {
  if (typeof content === "object" && content !== null) return content as MapMessagePayload;
  try {
    return JSON.parse(content) as MapMessagePayload;
  } catch {
    throw new Error("Invalid map message content");
  }
}

function parseAiMessagePayload(content: string | AiMessagePayload): AiMessagePayload {
  if (typeof content === "object" && content !== null) {
      return content as AiMessagePayload;
  }
  
  if (typeof content === "string") {
      try {
          return JSON.parse(content) as AiMessagePayload;
      } catch {
          throw new Error("Invalid AI message JSON content");
      }
  }
  throw new Error("Invalid AI message format");
}

export class MessageFactory {
  static createMessage(
    type: "text" | "file" | "map" | "ai_prompt",
    content: string | FileMessagePayload | MapMessagePayload | AiMessagePayload,
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
      const payload = parseFileMessagePayload(content as string | FileMessagePayload);
      return new FileMessage(
        payload.id ?? crypto.randomUUID(),
        payload.senderId ?? userId,
        payload.createdAt ?? new Date(),
        payload.fileUrl,
        payload.fileName,
        payload.fileSize
      );
    }

     if (type === "map") {
      const payload = parseMapMessagePayload(content as string | MapMessagePayload);
      
      return new MapMessage(
        payload.id ?? crypto.randomUUID(),
        payload.senderId ?? userId,
        payload.createdAt ? new Date(payload.createdAt) : new Date(),
        payload.placeName,
        payload.address,
        payload.latitude,
        payload.longitude,
        payload.mapImageUrl,
        payload.distanceFromSender
      );
    }

    if (type === "ai_prompt") {
      const payload = parseAiMessagePayload(content as string | AiMessagePayload);
      return new AiMessage(
        crypto.randomUUID(), 
        userId, 
        new Date(), 
        payload.prompt,
        payload.response,
        payload.model
      );
    }

    throw new Error("Unsupported message type");
  }

  static createSystemMessage(
    actionType: SystemActionType,
    content?: string
  ): SystemMessage {
    return new SystemMessage(
      crypto.randomUUID(),
      new Date(),
      actionType,
      content
    );
  }
}
