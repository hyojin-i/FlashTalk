'use client';

import React from 'react';
import { Message } from '@/domain/message/Message';
import { MapMessage } from '@/domain/message/MapMessage';

interface ChatBubbleProps {
    message: Message;
    isMe: boolean;
    senderName: string; 
}

export default function ChatBubble({ message, isMe, senderName }: ChatBubbleProps) {
    if (!(message instanceof MapMessage)) {
        return <div className="text-xs text-red-500">지도 메시지가 아닙니다.</div>;
    }

    const mapData = message.getContent();
    
    const navUrl = `https://map.naver.com/v5/search/${encodeURIComponent(mapData.placeName)}?c=${mapData.longitude},${mapData.latitude},15,0,0,dh`;

    return (
        <div className={`flex flex-col mb-4 w-full ${isMe ? 'items-end' : 'items-start'}`}>
            <span className="text-xs text-slate-400 mb-1">
                {isMe ? '내가 위치를 공유했습니다' : `${senderName}님이 위치를 공유했습니다`}
            </span>
            
            <div className={`rounded-2xl overflow-hidden border shadow-sm w-72 bg-white ${isMe ? 'border-indigo-200' : 'border-slate-200'}`}>
                
                <a href={navUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-36 bg-slate-100 relative group overflow-hidden">
                    {mapData.mapImageUrl ? (
                        <img src={mapData.mapImageUrl} alt={mapData.placeName} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                        <span className="flex items-center justify-center w-full h-full text-xs text-slate-400">지도를 불러올 수 없습니다.</span>
                    )}
                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="bg-black/60 text-white text-[10px] px-2 py-1 rounded-full">길찾기</span>
                    </div>
                </a>

                <span className="text-[10px] text-zinc-400 mb-1 whitespace-nowrap">
            {new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </span>
                
                <div className="p-3 bg-white">
                    <div className="flex justify-between items-start">
                        <h4 className="text-sm font-bold truncate text-zinc-900 w-full">{mapData.placeName}</h4>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-1">{mapData.address}</p>
                </div>
                
                <a 
                    href={navUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="block w-full text-center py-2.5 bg-slate-50 border-t text-xs font-semibold text-indigo-600 hover:bg-slate-100 transition-colors"
                >
                    네이버 지도로 길찾기
                </a>
            </div>
        </div>
    );
}