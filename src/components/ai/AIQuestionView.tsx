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
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');

    const [submittedPrompt, setSubmittedPrompt] = useState('');
    const [submittedModel, setSubmittedModel] = useState('');
    
    const [aiResponse, setAiResponse] = useState<string | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [displayedResponse, setDisplayedResponse] = useState<string>('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [aiStatus, setAiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    
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
        if (aiStatus === 'offline') {
            setAiError("AI 서버가 현재 오프라인 상태입니다.");
            return;
        }

        if (!prompt.trim()) {
            setAiError("프롬프트(질문 내용)를 입력해주세요!");
            return;
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
        setSubmittedModel(selectedModel);

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
                setAiError(`에러 발생: ${data.error}`);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                setAiError("⚠️ 사용자에 의해 생성이 취소되었습니다.");
            } else {
                setAiError("네트워크 오류로 응답을 받지 못했습니다.");
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
        setAiError(null);
        setDisplayedResponse('');
    };

    const requestShareAiResponse = async () => {
        if (selectedRoomIds.length === 0) return alert("왼쪽 목록에서 공유할 대화방을 1개 이상 선택해주세요.");
        if (!aiResponse) return alert("먼저 AI 답변을 생성해주세요.");

        const aiPayload = { prompt: submittedPrompt, response: aiResponse, model: submittedModel };
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
            
            <aside className={`absolute md:relative z-30 w-80 h-full bg-white border-r-2 border-zinc-300 flex flex-col shrink-0 transition-transform duration-300 ${isSidebarOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}>
                <div className="flex items-center justify-between p-4 border-b-2 border-zinc-200 shrink-0 bg-indigo-100">
                    <h2 className="font-black text-[16px] text-indigo-950">결과를 공유할 대화방 선택</h2>
                    <span className="text-sm font-extrabold text-indigo-700 bg-white px-2.5 py-1 rounded-md shadow-sm border border-indigo-200">{selectedRoomIds.length}개 선택됨</span>
                </div>
                
                <div className="p-3 border-b-2 border-zinc-200 shrink-0 bg-zinc-50">
                    <input 
                        type="text" placeholder="대화방 이름을 검색해주세요." value={roomSearchKeyword} onChange={e => setRoomSearchKeyword(e.target.value)}
                        className="w-full bg-white px-3 py-2.5 rounded-xl text-sm font-bold text-zinc-900 border border-zinc-300 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all placeholder:text-zinc-500 placeholder:font-semibold shadow-inner"
                    />
                </div>
                
                <ul className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar bg-white">
                    {filteredRooms.length === 0 ? (
                        <li className="text-center text-sm text-zinc-600 py-10 font-bold bg-zinc-50 rounded-xl m-2 border border-zinc-200">진행 중인 대화방이 없습니다.</li>
                    ) : (
                        filteredRooms.map(room => {
                            const canSelect = !!aiResponse && !aiError && !isLoading; 
                            const isSelected = selectedRoomIds.includes(room.roomId);

                            return (
                                <li 
                                    key={room.roomId} 
                                    className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all shadow-sm
                                        ${!canSelect ? 'cursor-not-allowed opacity-50 bg-zinc-100 border-zinc-200' : 'cursor-pointer hover:border-indigo-300'}
                                        ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-zinc-200 bg-white'}
                                    `} 
                                    onClick={() => {
                                        if (canSelect) toggleRoomSelection(room.roomId);
                                    }}
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-colors 
                                            ${isSelected ? 'bg-indigo-700 border-indigo-700' : 'bg-white border-zinc-400'}`}
                                        >
                                            {isSelected && <svg className="w-3.5 h-3.5 text-white font-bold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                        </div>
                                        <span className="truncate text-[15px] font-extrabold flex-1 text-zinc-950">
                                            {formatChatRoomListTitle(room.participants)}
                                        </span>
                                    </div>
                                </li>
                            );
                        })
                    )}
                </ul>

                <div className="p-4 border-t-2 border-zinc-200 bg-zinc-50 shrink-0 shadow-[0_-10px_20px_rgba(0,0,0,0.08)]">
                    <button 
                        onClick={requestShareAiResponse} 
                        disabled={isSending || !aiResponse || !!aiError || selectedRoomIds.length === 0} 
                        className="w-full py-4 bg-indigo-700 text-white rounded-xl font-black text-[15px] tracking-wide hover:bg-indigo-800 disabled:bg-zinc-400 disabled:text-zinc-100 disabled:border-zinc-400 disabled:opacity-80 transition-all active:scale-[0.98] shadow-lg shadow-indigo-300 border-2 border-indigo-800"
                    >
                        {isSending ? "전송 중..." : selectedRoomIds.length === 0 ? "대화방을 먼저 선택하세요" : `${selectedRoomIds.length}개 방에 전송하기`}
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col min-w-0 bg-[#fdfdfd] relative z-10">
                {isSidebarOpenMobile && <div className="absolute inset-0 bg-black/50 z-20 md:hidden" onClick={() => setIsSidebarOpenMobile(false)} />}

                <header className="flex items-center h-16 px-4 bg-white border-b-2 border-zinc-200 shrink-0 justify-between shadow-sm">
                    <div className="flex items-center">
                        <button onClick={() => setIsSidebarOpenMobile(true)} className="md:hidden mr-3 p-2 bg-zinc-100 border border-zinc-300 text-zinc-800 hover:bg-zinc-200 transition-colors rounded-lg font-bold">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <h1 className="text-xl font-black flex items-center gap-2 text-zinc-950 tracking-tight">
                             AI 프롬프트
                        </h1>
                    </div>
                    <div className="flex items-center gap-2 p-2 border-2 border-zinc-200 bg-zinc-50 shrink-0 rounded-xl shadow-inner">
                        <span className="font-extrabold text-zinc-800 text-sm ml-1">엔진:</span>
                        <select 
                            value={selectedModel} 
                            onChange={(e) => setSelectedModel(e.target.value)} 
                            disabled={isLoading} 
                            className="bg-white border-2 border-zinc-300 rounded-lg px-2.5 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 font-extrabold flex-1 disabled:bg-zinc-200 disabled:text-zinc-500 transition-colors text-zinc-950 cursor-pointer"
                        >
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash (고속)</option>
                            <option value="gemini-3.5-flash">Gemini 3.5 Flash (차세대)</option>
                            <option value="gemini-flash-latest">Gemini Flash Latest</option>
                        </select>
                    </div>
                    <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 bg-white text-zinc-800 hover:text-white hover:bg-zinc-900 border-2 border-zinc-300 rounded-xl text-[14px] font-black transition-colors shadow-sm ml-2">
                        화면 닫기
                    </button>
                </header>

                <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-hidden gap-5 max-w-4xl mx-auto w-full">
                    
                    <div className="flex flex-col gap-2 shrink-0">
                        <div className="flex justify-between items-end mb-1 px-1">
                            <label className="text-[15px] font-black text-zinc-950 flex items-center gap-2 tracking-tight">
                                AI에게 질문해주세요.
                                <span className="hidden sm:inline bg-zinc-100 text-zinc-700 border-2 border-zinc-200 text-[11px] px-2.5 py-0.5 rounded-full font-bold shadow-sm">Ctrl + Enter 전송</span>
                            </label>
                            <span className={`text-xs font-black px-2.5 py-1 rounded-lg border-2 shadow-sm ${isQuotaExceeded ? 'bg-red-100 text-red-700 border-red-300 animate-pulse' : 'bg-zinc-100 text-zinc-700 border-zinc-300'}`}>
                                할당량: <span className={isQuotaExceeded ? 'text-red-700' : 'text-indigo-700'}>{remainQuota}</span> / {MAX_AI_QUOTA}
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
                            className={`w-full h-36 p-5 bg-white border-2 rounded-2xl resize-none outline-none transition-all shadow-sm text-[16px] leading-relaxed font-bold text-zinc-950 placeholder:font-semibold placeholder:text-zinc-400 ${isQuotaExceeded ? 'border-red-400 bg-red-50/50 text-red-900 cursor-not-allowed placeholder:text-red-500' : 'border-zinc-300 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100'}`}
                        />
                        
                        <div className="flex gap-3 mt-1">
                            <button onClick={handleClearPrompt} disabled={isLoading || (!prompt && !aiResponse && !aiError)} className="px-6 py-4 bg-white text-zinc-800 border-2 border-zinc-300 rounded-2xl font-black text-[15px] hover:bg-zinc-100 hover:border-zinc-400 transition-colors disabled:bg-zinc-100 disabled:text-zinc-400 disabled:border-zinc-200 shadow-sm">
                                초기화
                            </button>
                            {isLoading ? (
                                <button 
                                    onClick={handleCancelGeneration} 
                                    className="flex-1 py-4 rounded-2xl font-black text-[16px] tracking-wide transition-all shadow-md bg-red-600 text-white hover:bg-red-700 border-2 border-red-700 animate-pulse"
                                >
                                    생성 중단하기
                                </button>
                            ) : (
                                <button 
                                    onClick={requestAiAnswer} 
                                    disabled={!prompt.trim() || aiStatus === 'offline' || isQuotaExceeded}
                                    className={`flex-1 py-4 rounded-2xl font-black text-[16px] tracking-wide transition-all active:scale-[0.99] shadow-md border-2 ${isQuotaExceeded ? 'bg-zinc-200 text-zinc-500 border-zinc-300 cursor-not-allowed shadow-none' : 'bg-zinc-950 text-white border-black hover:bg-zinc-800'}`}
                                >
                                    {isQuotaExceeded ? "할당량 초과됨" : "답변 생성하기"}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 bg-white border-2 border-zinc-200 rounded-2xl p-6 sm:p-8 overflow-y-auto relative custom-scrollbar shadow-inner">
                        {!aiResponse && !aiError && !isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 text-center px-4 bg-zinc-50/50 rounded-2xl m-2 border-2 border-dashed border-zinc-200">
                                <span className="text-6xl mb-4">💡</span>
                                <span className="text-[15px] font-extrabold text-zinc-500 leading-relaxed">
                                    질문을 입력하고 <span className="text-zinc-800">답변 생성하기</span> 버튼(또는 Ctrl + Enter)을 눌러주세요.
                                </span>
                            </div>
                        )}

                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-600 gap-5 bg-indigo-50/30 rounded-2xl">
                                <div className="w-12 h-12 border-[5px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin shadow-sm"></div>
                                <span className="font-black text-[15px] animate-pulse tracking-wide bg-white px-4 py-2 rounded-xl shadow-sm border border-indigo-100">데이터를 처리하는 중입니다...</span>
                            </div>
                        )}
                        {aiError && !isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-red-600 gap-4 px-6 text-center bg-red-50 rounded-2xl m-2 border border-red-200">
                                <span className="text-5xl">⚠️</span>
                                <span className="font-black text-[15px] bg-white px-5 py-3 rounded-xl shadow-sm border-2 border-red-200">{aiError}</span>
                            </div>
                        )}

                        {aiResponse && !isLoading && !aiError && (
                            <div className="text-zinc-950 whitespace-pre-wrap leading-[1.8] text-[16px] font-bold">
                                {displayedResponse}
                            </div>
                        )}
                    </div>
                </div>
            </main>
            
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 8px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #a1a1aa; border-radius: 10px; border: 2px solid white; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes slideUp { from { transform: translateY(15px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            `}</style>
        </div>
    );
}
