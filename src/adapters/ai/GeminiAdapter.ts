import { AIAdapter } from './AIAdapter';

export class GeminiAdapter implements AIAdapter {
    async askQuestion(prompt: string): Promise<string> {
        // Gemini API를 이용한 질의응답 로직 구현
        console.log(`Asking Gemini: ${prompt}`);
        return Promise.resolve(`Gemini response for: ${prompt}`);
    }
}
