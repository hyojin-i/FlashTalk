import { Message } from './Message';

export class FileMessage extends Message {
    fileUrl: string;
    fileName: string;

    constructor(id: string, senderId: string, createdAt: Date, fileUrl: string, fileName: string) {
        super(id, senderId, createdAt);
        this.fileUrl = fileUrl;
        this.fileName = fileName;
    }

    getContent(): { fileUrl: string; fileName: string } {
        return {
            fileUrl: this.fileUrl,
            fileName: this.fileName
        };
    }
}
