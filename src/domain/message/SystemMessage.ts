import { Message } from './Message';

export type SystemActionType = 'JOIN' | 'LEAVE' | 'INVITE';

export class SystemMessage extends Message {
    private actionType: SystemActionType;

    constructor(id: string, createdAt: Date, actionType: SystemActionType) {
        super(id, '', createdAt);
        this.actionType = actionType;
    }

    getActionType(): SystemActionType {
        return this.actionType;
    }

    getContent(): { actionType: SystemActionType } {
        return { actionType: this.actionType };
    }

    renderMessage(userName?: string): string {
        const name = userName?.trim() || '사용자';

        switch (this.actionType) {
            case 'JOIN':
                return `${name}님이 입장했습니다.`;
            case 'LEAVE':
                return `${name}님이 퇴장했습니다.`;
            case 'INVITE':
                return `${name}님이 초대되었습니다.`;
        }
    }
}
