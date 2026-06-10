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
    const getModelName = (modelString: string) => {
        if (!modelString) return 'Gemini AI';
        if (modelString.includes('pro')) return 'Gemini Pro';
        if (modelString.includes('3.5')) return 'Gemini 3.5 Flash';
        if (modelString.includes('2.5')) return 'Gemini 2.5 Flash';
        return 'Gemini AI';
    };

    const modelName = getModelName(message.model);
    const displayPrompt = message.prompt || "질문 내용이 삭제되었습니다.";
    const displayResponse = message.response || "⚠️ AI 답변을 불러오지 못했습니다.";

    return (
        <div
            style={{ width: '350px', maxWidth: '90vw' }}
            className={`flex flex-col gap-0 shadow-md rounded-2xl overflow-hidden border border-zinc-200/80 bg-white ${isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}
        >
            
            <div className="bg-zinc-900 text-white p-3.5 ml-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 ml-3 h-16 bg-white/5 rounded-bl-full"></div>
                <div className="flex items-center gap-1.5 mb-2 ml-3 opacity-90 relative z-10">
                    <span className="text-sm">💭</span>
                    <span className="text-[10px] font-bold ml-3 uppercase tracking-wider text-zinc-300">
                        {isMe ? '나의 프롬프트' : `${senderName}의 프롬프트`}
                    </span>
                </div>
                <p className="text-[13.5px] ml-3 leading-relaxed break-words font-medium text-zinc-50 relative z-10 ml-3">
                    {displayPrompt}
                </p>
            </div>
            
            <div className="p-4 bg-gradient-to-b from-white to-indigo-50/20">
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl drop-shadow-sm">🤖</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full border border-indigo-200">
                        {modelName}
                    </span>
                </div>
                
                <div
                    style={{ maxHeight: '50vh' }}
                    className="whitespace-pre-wrap leading-relaxed break-words text-sm font-medium text-zinc-800 overflow-y-auto pr-2 custom-scrollbar"
                >
                    {displayResponse}
                </div>
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            `}</style>
        </div>
    );
}