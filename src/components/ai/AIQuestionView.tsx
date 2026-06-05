'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MessageFactory } from '@/domain/message/MessageFactory';
import type { ChatRoomListItemDTO } from '@/entities/ChatRoomListItem';
import type { ParticipantsDTO } from '@/entities/Participants';

function formatChatRoomListTitle(participants: ParticipantsDTO[]): string {
    const totalParticipants = participants.length + 1;
    if (participants.length === 0) return "나와의 채팅"; 
    const names = participants.map((p) => p.name);
    const othersCount = totalParticipants - 2;
    if (names.length === 1 || othersCount <= 0) {
        if (names.length >= 2 && othersCount <= 0) return `${names[0]}, ${names[1]}`;
        return names[0]; 
    }
    return `${names[0]}, ${names[1] ?? names[0]} 외 ${othersCount}명`;
}

interface Props {
    userId: string;
    chatRooms: ChatRoomListItemDTO[];
    onClose: () => void;
    onSendToRooms: (roomIdList: string[], messagePayload: any) => Promise<void>;
}

const MAX_AI_QUOTA = 10;
const getTodayKey = (uid: string) => `ai_quota_${uid}_${new Date().toISOString().split('T')[0]}`;

export default function AiQuestionView({ userId, chatRooms: initialChatRooms, onClose, onSendToRooms }: Props) {
    const [chatRooms, setChatRooms] = useState<ChatRoomListItemDTO[]>(initialChatRooms);

    const [prompt, setPrompt] = useState('');
    
    const [submittedPrompt, setSubmittedPrompt] = useState('');
    
    const [aiResponse, setAiResponse] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    
    const [displayedResponse, setDisplayedResponse] = useState<string>('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [aiStatus, setAiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
    const [usedQuota, setUsedQuota] = useState<number>(0);

    const abortControllerRef = useRef<AbortController | null>(null);
    
    useEffect(() => {
        if (typeof window !== 'undefined' && userId){
        const storedQuota = localStorage.getItem(getTodayKey(userId));
            if (storedQuota) setUsedQuota(parseInt(storedQuota, 10));
            else setUsedQuota(0); 
        }
    }, [userId]);

    const remainQuota = Math.max(0, MAX_AI_QUOTA - usedQuota);
    const isQuotaExceeded = remainQuota <= 0;

    const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false); 
    const [roomSearchKeyword, setRoomSearchKeyword] = useState('');
    const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
    const [isSending, setIsSending] = useState(false);

    useEffect(() => { setChatRooms(initialChatRooms); }, [initialChatRooms]);
    useEffect(() => { checkAiConnection(selectedModel); }, [selectedModel]);

    useEffect(() => {
        return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
    }, []);

    const checkAiConnection = async (model: string) => {
        setAiStatus('checking');
        try {
            const res = await fetch(`/api/ai?action=status&model=${model}`);
            const data = await res.json();
            setAiStatus(data.status === 'online' ? 'online' : 'offline');
        } catch { setAiStatus('offline'); }
    };

    const requestAiAnswer = async () => {
        if (aiStatus === 'offline') return alert("AI 서버가 오프라인 상태입니다.");

        if (!prompt.trim()) {
            return alert("프롬프트(질문 내용)를 입력해주세요!");
        }
        
        if (isQuotaExceeded) {
            alert(`⚠️ 일일 질문 할당량(${MAX_AI_QUOTA}회)을 모두 소진했습니다! 내일 다시 이용해주세요.`);
            return;
        }

        setIsLoading(true);
        setAiResponse(null);
        setAiError(null);
        setSelectedRoomIds([]);
        setDisplayedResponse(''); 
        
        setSubmittedPrompt(prompt);

        if (abortControllerRef.current) abortControllerRef.current.abort();
        abortControllerRef.current = new AbortController();

        try {
            const res = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'generate', prompt, timeout: 30000, model: selectedModel }),
                signal: abortControllerRef.current.signal
            });
            const data = await res.json();
            if (res.ok) {
                setAiResponse(data.result);
                setUsedQuota(prev => {
                    const nextQuota = prev + 1;
                    if (typeof window !== 'undefined') localStorage.setItem(getTodayKey(userId), nextQuota.toString());
                    return nextQuota;
                });
            } else {
                setAiResponse(`에러 발생: ${data.error}`);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                setAiResponse("⚠️ 사용자에 의해 생성이 취소되었습니다.");
            } else {
                setAiResponse("네트워크 오류로 응답을 받지 못했습니다.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancelGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort(); 
            setIsLoading(false);
            setAiError("생성이 취소되었습니다. 프롬프트를 수정하여 다시 요청해보세요.");
        }
    };

    useEffect(() => {
        if (!aiResponse) return;
        let index = 0;
        const speed = 10; 
        const intervalId = setInterval(() => {
            setDisplayedResponse(aiResponse.slice(0, index));
            index++;
            if (index > aiResponse.length) {
                clearInterval(intervalId);
            }
        }, speed);

        return () => clearInterval(intervalId); 
    }, [aiResponse]);

    const handleClearPrompt = () => {
        setPrompt('');
        setAiResponse(null);
        setDisplayedResponse('');
    };

    const requestShareAiResponse = async () => {
        if (selectedRoomIds.length === 0) return alert("왼쪽 목록에서 공유할 대화방을 1개 이상 선택해주세요.");
        if (!aiResponse) return alert("먼저 AI 답변을 생성해주세요.");

        const aiPayload = { prompt: submittedPrompt, response: aiResponse, model: selectedModel };
        const aiMsg = MessageFactory.createMessage('ai_prompt' as any, aiPayload as any, userId, "temp");
        if (!aiMsg) return;

        setIsSending(true);
        try {
            await onSendToRooms(selectedRoomIds, aiMsg);
            setSelectedRoomIds([]);
            setIsSidebarOpenMobile(false);
        } finally {
            setIsSending(false);
        }
    };

    const toggleRoomSelection = (roomId: string) => {
        setSelectedRoomIds(prev => prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]);
    };

    const filteredRooms = useMemo(() => {
        return chatRooms.filter(room => formatChatRoomListTitle(room.participants).toLowerCase().includes(roomSearchKeyword.toLowerCase()));
    }, [chatRooms, roomSearchKeyword]);

    return (
        <div className="fixed inset-0 z-[100] flex bg-zinc-100 animate-slide-up overflow-hidden text-zinc-900">
            
            <aside className={`absolute md:relative z-30 w-80 h-full bg-white border-r border-zinc-200 flex flex-col shrink-0 transition-transform duration-300 ${isSidebarOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                <div className="flex items-center justify-between p-4 border-b border-zinc-100 shrink-0 bg-indigo-50">
                    <h2 className="font-extrabold text-[15px] text-indigo-900">결과를 공유할 대화방 선택</h2>
                    <span className="text-xs font-bold text-indigo-600 bg-white px-2 py-1 rounded-md shadow-sm">{selectedRoomIds.length}개 선택됨</span>
                </div>
                
                <div className="p-3 border-b border-zinc-100 shrink-0">
                    <input 
                        type="text" placeholder="대화방 이름을 검색해주세요." value={roomSearchKeyword} onChange={e => setRoomSearchKeyword(e.target.value)}
                        className="w-full bg-zinc-100 px-3 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                </div>
                
                <ul className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {filteredRooms.length === 0 ? (
                        <li className="text-center text-sm text-zinc-400 py-10 font-medium">진행 중인 대화방이 없습니다.</li>
                    ) : (
                        filteredRooms.map(room => {
                            const canSelect = !!aiResponse && !aiError && !isLoading; 
                            const isSelected = selectedRoomIds.includes(room.roomId);

                            return (
                                <li 
                                    key={room.roomId} 
                                    className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all 
                                        ${!canSelect ? 'cursor-not-allowed opacity-40 bg-zinc-50' : 'cursor-pointer'}
                                        ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-zinc-100'}
                                    `} 
                                    onClick={() => {
                                        if (canSelect) toggleRoomSelection(room.roomId);
                                    }}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors 
                                            ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-zinc-300'}`}
                                        >
                                            {isSelected && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                        </div>
                                        <span className="truncate text-sm font-bold flex-1 text-zinc-800">
                                            {formatChatRoomListTitle(room.participants)}
                                        </span>
                                    </div>
                                </li>
                            );
                        })
                    )}
                </ul>

                <div className="p-4 border-t border-zinc-200 bg-white shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                    <button 
                        onClick={requestShareAiResponse} 
                        disabled={isSending || !aiResponse || selectedRoomIds.length === 0} 
                        className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-base hover:bg-indigo-700 disabled:opacity-50 transition-transform active:scale-[0.98] shadow-lg shadow-indigo-200"
                    >
                        {isSending ? "전송 중..." : selectedRoomIds.length === 0 ? "대화방을 선택하세요" : `${selectedRoomIds.length}개 방에 전송하기`}
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col min-w-0 bg-[#fdfdfd] relative z-10">
                {isSidebarOpenMobile && <div className="absolute inset-0 bg-black/40 z-20 md:hidden" onClick={() => setIsSidebarOpenMobile(false)} />}

                <header className="flex items-center h-14 px-4 bg-white border-b border-zinc-200 shrink-0 justify-between shadow-sm">
                    <div className="flex items-center">
                        <button onClick={() => setIsSidebarOpenMobile(true)} className="md:hidden mr-3 p-1.5 text-zinc-600 hover:bg-zinc-100 rounded-lg">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <h1 className="text-lg font-extrabold flex items-center gap-1.5">
                            <span className="text-xl"></span> AI 프롬프트
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 p-3 border-b border-zinc-100 bg-zinc-50 shrink-0">
        <span className="font-semibold text-zinc-500 text-sm">엔진:</span>
        <select 
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)} 
            disabled={isLoading} 
            className="bg-white border border-zinc-300 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium flex-1 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (기본/고속)</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro (고성능/추론)</option>
            <option value="gemini-3.5-flash">Gemini 3.5 Flash (차세대 프리뷰)</option>
            <option value="gemini-flash-latest">Gemini Flash Latest (자동 최신화)</option>
        </select>
    </div>
                    <button onClick={onClose} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-100 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded-lg text-sm font-bold transition-colors">
                        화면 닫기
                    </button>
                </header>

                <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-hidden gap-5 max-w-4xl mx-auto w-full">
                    
                    <div className="flex flex-col gap-2 shrink-0">
                        <div className="flex justify-between items-end mb-1 px-1">
                            <label className="text-sm font-bold text-zinc-700 flex items-center gap-2">
                                AI에게 질문해주세요.
                                <span className="hidden sm:inline bg-zinc-100 text-zinc-500 text-[10px] px-2 py-0.5 rounded-full font-medium">Ctrl + Enter 전송</span>
                            </label>
                            <span className={`text-[11px] font-bold px-2 py-1 rounded-md border ${isQuotaExceeded ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}>
                                할당량: {remainQuota}/{MAX_AI_QUOTA}
                            </span>
                        </div>
                        
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                    e.preventDefault();
                                    if (!isQuotaExceeded && !isLoading && prompt.trim() && aiStatus !== 'offline') requestAiAnswer();
                                }
                            }}
                            disabled={isQuotaExceeded || isLoading}
                            placeholder={isQuotaExceeded ? "⚠️ 일일 할당량을 모두 소진했습니다. 내일 다시 시도해주세요." : "(Ctrl + Enter 키로 바로 전송 가능)"}
                            className={`w-full h-32 p-4 bg-white border rounded-2xl resize-none outline-none transition-all shadow-sm text-[15px] leading-relaxed ${isQuotaExceeded ? 'border-red-300 bg-red-50/30 text-red-900 cursor-not-allowed placeholder:text-red-400' : 'border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'}`}
                        />
                        
                        <div className="flex gap-2">
                            <button onClick={handleClearPrompt} disabled={isLoading || (!prompt && !aiResponse)} className="px-5 py-3.5 bg-zinc-200 text-zinc-700 rounded-2xl font-bold text-sm hover:bg-zinc-300 transition-colors disabled:opacity-50">
                                초기화
                            </button>
                            {isLoading ? (
                                <button 
                                    onClick={handleCancelGeneration} 
                                    className="flex-1 py-3.5 rounded-2xl font-bold text-base transition-all active:scale-[0.99] shadow-md bg-red-500 text-white hover:bg-red-600 animate-pulse"
                                >
                                    생성 취소 (중단)
                                </button>
                            ) : (
                                <button 
                                    onClick={requestAiAnswer} 
                                    disabled={!prompt.trim() || aiStatus === 'offline' || isQuotaExceeded}
                                    className={`flex-1 py-3.5 rounded-2xl font-bold text-base transition-all active:scale-[0.99] shadow-md ${isQuotaExceeded ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed shadow-none' : 'bg-zinc-900 text-white hover:bg-black'}`}
                                >
                                    {isQuotaExceeded ? "할당량 초과됨" : "답변 생성하기"}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 overflow-y-auto relative custom-scrollbar shadow-inner">
                        {!aiResponse && !aiError && !isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-300 text-center px-4">
                                <span className="text-5xl mb-3">💡</span>
                                <span className="text-sm font-bold text-zinc-400 leading-relaxed">
                                    질문을 입력하고 답변을 생성해주세요.
                                </span>
                            </div>
                        )}

                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-500 gap-4">
                                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                                <span className="font-bold text-sm animate-pulse tracking-wide">데이터를 처리하는 중...</span>
                            </div>
                        )}

                        {aiError && !isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 gap-3 px-6 text-center">
                                <span className="text-4xl">⚠️</span>
                                <span className="font-bold text-sm">{aiError}</span>
                            </div>
                        )}

                        {aiResponse && !isLoading && (
                            <div className="text-zinc-800 whitespace-pre-wrap leading-relaxed text-[15px]">
                                {aiResponse}
                            </div>
                        )}
                    </div>
                </div>
            </main>
            
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .animate-slide-up { animation: slideUp 0.3s ease-out forwards; }
                @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            `}</style>
        </div>
    );
}
