import { Message } from './Message';

export type SystemActionType = "JOIN" | "LEAVE" | "INVITE" | "USER_LEFT";

export class SystemMessage extends Message {
    private actionType: SystemActionType;
    private contentText: string;

    constructor(
        id: string,
        createdAt: Date,
        actionType: SystemActionType,
        contentText?: string
    ) {
        super(id, "", createdAt);
        this.actionType = actionType;
        this.contentText = contentText ?? "";
    }

    getActionType(): SystemActionType {
        return this.actionType;
    }

    getContent(): { actionType: SystemActionType; content: string } {
        return { actionType: this.actionType, content: this.contentText };
    }

    renderMessage(userName?: string): string {
        if (this.contentText.trim()) return this.contentText;

        const name = userName?.trim() || "사용자";

        switch (this.actionType) {
            case "JOIN":
                return `${name}님이 입장했습니다.`;
            case "LEAVE":
            case "USER_LEFT":
                return `${name}님이 퇴장했습니다.`;
            case "INVITE":
                return `${name}님이 초대되었습니다.`;
        }
    }
}
