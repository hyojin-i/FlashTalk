import { AIAdapter } from './AIAdapter';
import axios from 'axios';
import { externalEndpoints } from '@/lib/externalEndpoints';

export class GeminiAdapter implements AIAdapter {
    private apiKey = process.env.GEMINI_API_KEY || "";
    
    private model = "gemini-2.5-flash"; 
    private timeout = 30000;

    setTimeout(time: number): void {
        this.timeout = time;
    }

    changeModel(newModel: string): void {
        this.model = newModel;
    }

    async checkAiStatus(): Promise<boolean> {
        try {
            if (!this.apiKey) return false;
            
            const url = `${externalEndpoints.ai.gemini}/models?key=${this.apiKey}`;
            const response = await axios.get(url, { timeout: this.timeout });
            return response.status === 200;
        } catch (error) {
            console.error("Gemini API Connection Failed:", error);
            return false;
        }
    }

    async requestAnswer(prompt: string): Promise<string> {
        try {
            if (!this.apiKey) throw new Error("API 키가 설정되지 않았습니다.");

            const url = `${externalEndpoints.ai.gemini}/models/${this.model}:generateContent?key=${this.apiKey}`;
            
            const response = await axios.post(url, {
                contents: [{ parts: [{ text: prompt }] }]
            }, { timeout: this.timeout });
            
            return response.data.candidates[0].content.parts[0].text;
        } catch (error: any) {
            if (error.response?.status === 429) {
                console.error("🚨 Gemini API Quota Exceeded (429):", error.response?.data);
                throw new Error("해당 AI 모델의 무료 요청 한도를 초과했습니다. 다른 엔진을 선택하거나 잠시 후 시도해주세요.");
            }
            
            if (error.code === 'ECONNABORTED') {
                throw new Error(`AI 응답 시간(${this.timeout / 1000}초)을 초과했습니다. 다시 시도해주세요.`);
            }

            console.error("AI Generation Error:", error.response?.data || error.message);
            throw new Error("AI 응답을 생성하지 못했습니다. 일시적인 서버 오류일 수 있습니다.");
        }
    }
}
