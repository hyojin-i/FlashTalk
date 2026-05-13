export abstract class Message {
    id: string;
    senderId: string;
    createdAt: Date;

    constructor(id: string, senderId: string, createdAt: Date) {
        this.id = id;
        this.senderId = senderId;
        this.createdAt = createdAt;
    }

    // 메시지 내용을 반환하는 추상 메서드
    abstract getContent(): any;
}
