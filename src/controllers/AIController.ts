import { GeminiAdapter } from '@/adapters/ai/GeminiAdapter';

export class AIController {
    private aiAdapter = new GeminiAdapter();

    async requestAi(prompt: string): Promise<string> {
        return await this.aiAdapter.requestAnswer(prompt);
    }

    async checkConnection(): Promise<boolean> {
        return await this.aiAdapter.checkAiStatus();
    }

    updateSettings(timeout?: number, model?: string) {
        if (timeout) this.aiAdapter.setTimeout(timeout);
        if (model) this.aiAdapter.changeModel(model);
    }
}
