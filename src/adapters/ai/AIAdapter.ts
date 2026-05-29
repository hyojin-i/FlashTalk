export interface AIAdapter {
    requestAnswer(prompt: string): Promise<string>;

    checkAiStatus(): Promise<boolean>;
    
    setTimeout(time: number): void;
    changeModel(newModel: string): void;
}
