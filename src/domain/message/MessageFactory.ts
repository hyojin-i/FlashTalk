import { Message } from "./Message";
import { TextMessage } from "./TextMessage";
import { FileMessage } from "./FileMessage";

type FileMessagePayload = {
  id?: string;
  senderId?: string;
  createdAt?: Date;
  fileUrl: string;
  fileName: string;
};

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

    if (type === "file" && typeof content === "object" && content !== null) {
      const payload = content as FileMessagePayload;
      return new FileMessage(
        payload.id ?? crypto.randomUUID(),
        payload.senderId ?? userId,
        payload.createdAt ?? new Date(),
        payload.fileUrl,
        payload.fileName
      );
    }

    throw new Error("Unsupported message type");
  }
}
