import { Message } from './Message';
import { TextMessage } from './TextMessage';
import { FileMessage } from './FileMessage';

export class MessageFactory {
    static createMessage(type: 'text' | 'file', payload: any): Message {
        const id = payload.id || crypto.randomUUID();
        const senderId = payload.senderId;
        const createdAt = payload.createdAt || new Date();

        if (type === 'text') {
            return new TextMessage(id, senderId, createdAt, payload.content);
        } else if (type === 'file') {
            return new FileMessage(id, senderId, createdAt, payload.fileUrl, payload.fileName);
        }

        throw new Error('Unsupported message type');
    }
}
