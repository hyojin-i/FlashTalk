export interface AIAdapter {
    askQuestion(prompt: string): Promise<string>;
    // AI 연동에 필요한 추가 메서드 정의
}
