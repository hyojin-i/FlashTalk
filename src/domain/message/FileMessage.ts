import { Message } from "./Message";

export class FileMessage extends Message {
  fileUrl: string;
  fileName: string;
  fileSize: number;

  constructor(
    id: string,
    senderId: string,
    createdAt: Date,
    fileUrl: string,
    fileName: string,
    fileSize: number
  ) {
    super(id, senderId, createdAt);
    this.fileUrl = fileUrl;
    this.fileName = fileName;
    this.fileSize = fileSize;
  }

  getContent(): { fileUrl: string; fileName: string; fileSize: number } {
    return {
      fileUrl: this.fileUrl,
      fileName: this.fileName,
      fileSize: this.fileSize,
    };
  }
}
