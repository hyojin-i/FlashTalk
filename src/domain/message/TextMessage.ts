import { Message } from './Message';

export class TextMessage extends Message {
    content: string;

    constructor(id: string, senderId: string, createdAt: Date, content: string) {
        super(id, senderId, createdAt);
        this.content = content;
    }

    getContent(): string {
        return this.content;
    }
}
