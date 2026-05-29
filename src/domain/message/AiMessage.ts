import { Message } from "./Message";

export class AiMessage extends Message {
  constructor(
    id: string,
    senderId: string,
    createdAt: Date,
    public prompt: string,
    public aiResponse: string,
    public model: string
  ) {
    super(id, senderId, createdAt);
  }
  getContent(): string {
    return JSON.stringify({
      prompt: this.prompt,
      response: this.aiResponse,
      model: this.model,
    });
  }
}