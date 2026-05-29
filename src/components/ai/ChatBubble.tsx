'use client';

import React from 'react';

interface AiMessageProps {
    prompt: string;
    response: string;
    model: string;
}

interface AiChatBubbleProps {
    message: AiMessageProps;
    isMe: boolean;
    senderName: string;
}

export default function AiChatBubble({ message, isMe, senderName }: AiChatBubbleProps) {
    const isPro = message.model.includes('pro');

    return (
        <div className="flex flex-col gap-2 max-w-[280px] sm:max-w-[340px] shadow-sm rounded-xl overflow-hidden border border-zinc-200">
            <div className="bg-zinc-800 text-white p-3.5 text-sm font-medium">
                <span className="text-[11px] text-zinc-400 block mb-1.5 font-bold uppercase tracking-wider flex items-center gap-1">
                    <span>💭</span> {isMe ? '나의 프롬프트' : `${senderName}의 프롬프트`}
                </span>
                <p className="leading-snug break-words">{message.prompt}</p>
            </div>
            
            <div className="bg-white p-4 text-[14px] text-zinc-800 border-t border-zinc-100">
                <div className="flex items-center gap-1.5 mb-2 border-b border-indigo-50 pb-2">
                    <span className="text-base">🤖</span>
                    <span className="text-[11px] text-indigo-600 font-extrabold uppercase tracking-wide">
                        {isPro ? 'Gemini Pro 답변' : 'Gemini Flash 답변'}
                    </span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed break-words font-medium text-zinc-700">
                    {message.response}
                </div>
            </div>
        </div>
    );
}