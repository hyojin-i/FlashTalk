'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LocationResult } from '@/adapters/map/MapAdapter';
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

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; 
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180; 
    const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return Math.round(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
}

interface Props { userId: string; chatRooms: ChatRoomListItemDTO[]; onSendToRooms: (roomIdList: string[], messagePayload: any) => Promise<void>; }

interface SelectedTarget {
    type: 'search' | 'myLocation';
    id: string;
    placeName: string;
    address: string;
    latitude: number;
    longitude: number;
    distance?: number;
    mapImageUrl?: string | null;
}

export default function MapSearchView({ userId, chatRooms, onSendToRooms }: Props) {
    const router = useRouter();

    const inputRef = useRef<HTMLInputElement>(null);
    
    const [keyword, setKeyword] = useState('');
    const [lastSearchedKeyword, setLastSearchedKeyword] = useState('');

    const [isComposing, setIsComposing] = useState(false);
    
    const [isSearched, setIsSearched] = useState(false); 
    const [results, setResults] = useState<LocationResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [activeSort, setActiveSort] = useState<'distance' | 'accuracy'>('distance');

    const [myCoords, setMyCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [myLocationData, setMyLocationData] = useState<{ address: string; mapImageUrl: string } | null>(null);
    const [gpsDenied, setGpsDenied] = useState(false);
    const [gpsLoading, setGpsLoading] = useState(true);
    
    const [selectedTarget, setSelectedTarget] = useState<SelectedTarget | null>(null);

    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
    const [isSending, setIsSending] = useState(false);

    const selectedTargetRef = useRef(selectedTarget);
    const isSheetOpenRef = useRef(isSheetOpen);
    const closedByPopStateRef = useRef(false);
    const pushedDetailIdRef = useRef<string | null>(null);
    const wasSheetOpenRef = useRef(false);
    selectedTargetRef.current = selectedTarget;
    isSheetOpenRef.current = isSheetOpen;

    const updateLocation = useCallback(() => {
        setGpsLoading(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (pos) => {
                    const lat = pos.coords.latitude, lng = pos.coords.longitude;
                    setMyCoords({ lat, lng }); 
                    setGpsDenied(false); 
                    try {
                        const res = await fetch(`/api/map?action=gps&lat=${lat}&lng=${lng}`);
                        const data = await res.json();
                        if (res.ok && data.imageUrl) setMyLocationData({ address: data.address || "현재 위치", mapImageUrl: data.imageUrl });
                        else setMyLocationData({ address: "현재 위치", mapImageUrl: "" });
                    } catch (e) { setMyLocationData({ address: "현재 위치", mapImageUrl: "" }); } 
                    finally { setGpsLoading(false); }
                }, 
                (error) => { 
                    setGpsDenied(true); setMyCoords(null); setMyLocationData(null); setGpsLoading(false); 
                }, 
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 } 
            );
        } else { setGpsDenied(true); setGpsLoading(false); }
    }, []);

    useEffect(() => { 
        updateLocation(); 
        
        let permissionStatus: PermissionStatus | null = null;
        
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' }).then(status => {
                permissionStatus = status;
                permissionStatus.onchange = () => {
                    if (permissionStatus?.state === 'granted') {
                        setGpsDenied(false);
                        updateLocation();
                    }
                    else if (permissionStatus?.state === 'denied') {
                        setGpsDenied(true); setMyCoords(null); setMyLocationData(null); setGpsLoading(false);
                    }
                };
            }).catch(() => {});
        }

        const handleVisibilityChange = () => { if (document.visibilityState === 'visible') updateLocation(); };

        const handleFocus = () => { updateLocation(); };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        window.addEventListener('focus', handleFocus);

        return () => {
            if (permissionStatus) permissionStatus.onchange = null;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [updateLocation]);

    useEffect(() => {
        if (gpsDenied) setActiveSort('accuracy');
    }, [gpsDenied]);

    useEffect(() => {
        if (!selectedTarget) {
            pushedDetailIdRef.current = null;
            return;
        }
        if (pushedDetailIdRef.current === selectedTarget.id) return;
        pushedDetailIdRef.current = selectedTarget.id;
        window.history.pushState({ mapDetail: true }, '', window.location.href);
    }, [selectedTarget]);

    useEffect(() => {
        if (!isSheetOpen) {
            wasSheetOpenRef.current = false;
            return;
        }
        if (wasSheetOpenRef.current) return;
        wasSheetOpenRef.current = true;
        window.history.pushState({ mapSheet: true }, '', window.location.href);
    }, [isSheetOpen]);

    const executeSearch = useCallback(async (searchQuery: string) => {
        const rawKeyword = searchQuery.trim();
        if (!rawKeyword) {
            setIsSearched(false); setResults([]); setSelectedTarget(null); return;
        }

        setIsSearched(true);
        setIsLoading(true); 
        setSelectedTarget(null);

        try {
            let finalResults: LocationResult[] = [];
            const actualSort = (activeSort === 'distance' && myCoords && !gpsDenied) ? 'distance' : 'accuracy';

            if (actualSort === 'distance' && myCoords) {
                let searchSuccess = false;
                const gpsQuery = `&lat=${myCoords.lat}&lng=${myCoords.lng}`;

                if (myLocationData && myLocationData.address && myLocationData.address !== "현재 위치") {
                    const parts = myLocationData.address.split(' ');
                    const localArea = parts.length >= 3 ? parts[2] : parts[1] || parts[0];
                    
                    if (localArea && !rawKeyword.includes(localArea)) {
                        const smartKeyword = `${localArea} ${rawKeyword}`;
                        const res1 = await fetch(`/api/map?action=search&keyword=${encodeURIComponent(smartKeyword)}${gpsQuery}`);
                        const data1 = await res1.json();
                        if (res1.ok && data1.results && data1.results.length > 0) {
                            finalResults = data1.results;
                            searchSuccess = true;
                        }
                    }
                }
                if (!searchSuccess) {
                    const res2 = await fetch(`/api/map?action=search&keyword=${encodeURIComponent(rawKeyword)}${gpsQuery}`);
                    const data2 = await res2.json();
                    if (res2.ok && data2.results) finalResults = data2.results;
                }
                
                if (finalResults.length > 0) {
                    finalResults = finalResults.map((loc: LocationResult) => ({
                        ...loc,
                        distance: loc.distance ?? calculateDistance(myCoords.lat, myCoords.lng, loc.latitude, loc.longitude)
                    })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
                }
            } else {
                const res = await fetch(`/api/map?action=search&keyword=${encodeURIComponent(rawKeyword)}`);
                const data = await res.json();
                if (res.ok && data.results) {
                    finalResults = data.results;
                }
            }

            setResults(finalResults);
        } catch { 
            setResults([]); 
        } finally { 
            setIsLoading(false); 
        }
    }, [myCoords, myLocationData, gpsDenied, activeSort]);

    const handleSearchClick = () => {
        const trimmed = keyword.trim();
        if (!trimmed) return;
        setLastSearchedKeyword(trimmed);
        executeSearch(trimmed);
    };

    useEffect(() => {
        if (isSearched && lastSearchedKeyword.trim() !== '' && !gpsLoading) {
            executeSearch(lastSearchedKeyword);
        }
    }, [gpsDenied, myCoords?.lat, myCoords?.lng, gpsLoading, activeSort, executeSearch, isSearched, lastSearchedKeyword]); 

    const handleSelectLocation = async (loc: LocationResult) => {
        setSelectedTarget({
            type: 'search', id: loc.id, placeName: loc.placeName, address: loc.address,
            latitude: loc.latitude, longitude: loc.longitude, distance: loc.distance, mapImageUrl: null
        });
        try {
            const res = await fetch(`/api/map?action=image&lat=${loc.latitude}&lng=${loc.longitude}`);
            const data = await res.json();
            if (res.ok) {
                setSelectedTarget(prev => prev?.id === loc.id ? { ...prev, mapImageUrl: data.imageUrl } : prev);
            }
        } catch (e) {}
    };

    const handleSelectMyLocation = () => {
        if (!myCoords || !myLocationData) return;
        setSelectedTarget({
            type: 'myLocation', 
            id: 'my-loc', 
            placeName: "현재 위치", 
            address: myLocationData.address,
            latitude: myCoords.lat, 
            longitude: myCoords.lng, 
            distance: 0, 
            mapImageUrl: myLocationData.mapImageUrl
        });
    };

    const handleBackToList = () => {
        setSelectedTarget(null);
    };

    const toggleRoomSelection = (roomId: string) => setSelectedRoomIds(prev => prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]);

    const executeShare = async () => {
        if (selectedRoomIds.length === 0 || !selectedTarget) return;

        const mapMsg = MessageFactory.createMessage('map', {
            placeName: selectedTarget.placeName, address: selectedTarget.address,
            latitude: selectedTarget.latitude, longitude: selectedTarget.longitude,
            mapImageUrl: selectedTarget.mapImageUrl || "", distanceFromSender: selectedTarget.distance
        }, userId, "temp");

        setIsSending(true);
        try {
            await onSendToRooms(selectedRoomIds, mapMsg); 
            setIsSheetOpen(false); setSelectedRoomIds([]); 
            setSelectedTarget(null); 
        } finally { setIsSending(false); }
    };

    const isDefaultMode = !isSearched || !lastSearchedKeyword.trim(); 
    const isNoResults = isSearched && !!lastSearchedKeyword.trim() && !isLoading && results.length === 0;

    return (
        <div className="fixed top-0 left-0 right-0 bottom-16 z-[80] flex flex-col bg-zinc-50 dark:bg-zinc-950 animate-slide-up overflow-hidden">
            <header className="flex items-center h-14 px-4 bg-white dark:bg-zinc-950 border-b border-zinc-200 shrink-0 shadow-sm z-20">
                <h1 className="text-lg font-bold ml-2 text-zinc-900">장소 검색 및 공유</h1>
            </header>

            {!selectedTarget ? (
                <div className="flex-1 flex flex-col overflow-hidden relative bg-white dark:bg-zinc-950">
                    
                    <div className={`text-xs px-4 py-1.5 font-bold flex items-center gap-1.5 shrink-0 transition-colors ${gpsLoading ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-300' : gpsDenied ? 'bg-red-50 text-red-600 dark:bg-zinc-950 dark:text-red-400' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                        {gpsLoading ? (
                            <><span className="text-[10px] animate-pulse">⏳</span> 현재 위치 정보를 확인하는 중입니다...</>
                        ) : gpsDenied ? (
                            <><span className="text-[10px]">🚫</span> 위치 권한 차단됨</>
                        ) : (
                            <><span className="text-[10px]">📍</span> 현재 위치 활성화됨</>
                        )}
                    </div>

                    <div className="px-4 pt-3 pb-2 shrink-0 bg-white dark:bg-zinc-950 z-10">
                        <div className="flex gap-2">
                            <div className="flex-1 relative flex items-center bg-zinc-100 dark:bg-zinc-950 rounded-xl outline-none focus-within:ring-2 focus-within:ring-sky-500/50 transition-shadow border border-transparent dark:border-zinc-800">
                                <input 
                                ref={inputRef}
                                    type="text" 
                                    value={keyword} 
                                    onChange={e => { 
                                        setKeyword(e.target.value); 
                                        if (e.target.value.trim() === '') { setResults([]); setIsSearched(false); } 
                                    }} 
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && keyword.trim() !== '') handleSearchClick();
                                    }} 
                                    maxLength={100} 
                                    placeholder="검색어를 입력해주세요." 
                                    className="w-full p-3 pr-10 text-base text-zinc-900 dark:text-zinc-50 font-medium placeholder-zinc-500 bg-transparent outline-none" 
                                />
                                
                                {keyword && (
                                    <button 
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault()
                                    }}
                                        onClick={() => {
                                            setKeyword('');
                                            setResults([]);
                                            setIsSearched(false);
                                        }}
                                        className="absolute right-3 p-1 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                                        aria-label="검색어 지우기"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                            <button 
                                onClick={handleSearchClick} 
                                disabled={isLoading || !keyword.trim()} 
                                className="shrink-0 px-6 py-3 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl font-bold hover:from-indigo-600 hover:to-violet-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {isLoading ? "..." : "검색"}
                            </button>
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                            <button 
                                onClick={() => setActiveSort('accuracy')}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${activeSort === 'accuracy' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
                            >
                                정확도순
                            </button>
                            <button 
                                onClick={() => setActiveSort('distance')}
                                disabled={gpsDenied || gpsLoading} 
                                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${activeSort === 'distance' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
                            >
                                거리순
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pb-4 relative border-t border-zinc-100 dark:border-zinc-800">
                        
                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-zinc-950/80 z-10 backdrop-blur-sm gap-3">
                                <div className="w-8 h-8 border-4 border-zinc-200 border-t-sky-500 rounded-full animate-spin"></div>
                                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{gpsLoading ? "위치 정보를 가져오는 중..." : "장소 검색 중..."}</span>
                            </div>
                        )}

                        {isNoResults ? (
                            <div className="w-full p-10 flex flex-col items-center justify-center text-zinc-400">
                                <span className="text-4xl mb-4">🔍</span><span className="text-sm font-medium">검색 결과가 없습니다.</span>
                            </div>
                        ) : isDefaultMode && gpsLoading ? (
                            <div className="w-full p-10 flex flex-col items-center justify-center text-zinc-400"><span className="text-sm font-medium animate-pulse">위치를 찾는 중입니다...</span></div>
                        ) : isDefaultMode && gpsDenied ? (
                            <div className="w-full p-10 flex flex-col items-center justify-center text-zinc-400">
                                <span className="text-4xl mb-4 opacity-50">🔍</span>
                                <span className="text-sm font-medium text-center text-zinc-500 leading-relaxed">
                                    현재 위치를 알 수 없습니다.<br/>상단의 검색창에 장소명을 입력하여 찾아보세요.
                                </span>
                            </div>
                        ) : isDefaultMode && myLocationData && myCoords ? (
                            <div onClick={handleSelectMyLocation} className="w-full p-8 bg-sky-50/80 dark:bg-sky-950/30 flex flex-col justify-center items-center border-b border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors">
                                <span className="text-xs font-extrabold text-sky-600 dark:text-sky-400 mb-3 bg-white dark:bg-zinc-950 px-4 py-2 rounded-full shadow-sm border border-sky-100 dark:border-zinc-700 flex items-center gap-1.5">
                                    <span>📍</span> 현재 내 위치 상세 보기 <svg className="w-3 h-3 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                                </span>
                                <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50 text-center leading-tight break-words px-4">{myLocationData.address}</span>
                                <span className="text-xs text-zinc-400 mt-2">클릭하여 이 위치를 바로 공유하세요</span>
                            </div>
                        ) : (
                            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {results.map((loc) => (
                                    <li key={loc.id} onClick={() => handleSelectLocation(loc)} className="p-4 cursor-pointer flex justify-between hover:bg-sky-50/80 dark:hover:bg-zinc-900 transition-colors border-l-4 border-transparent hover:border-sky-400">
                                        <div className="min-w-0 pr-4 flex-1">
                                            <p className="text-base font-bold text-zinc-900 dark:text-zinc-50 break-words leading-tight">{loc.placeName}</p>
                                            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 break-words leading-snug">{loc.address}</p>
                                        </div>
                                        <div className="flex flex-col items-end shrink-0 ml-2">
                                            {activeSort === 'distance' && loc.distance !== undefined && (
                                                <span className="text-xs bg-zinc-100 dark:bg-zinc-950 px-2.5 py-1 rounded-md h-fit text-zinc-600 dark:text-zinc-300 font-bold whitespace-nowrap">
                                                    {loc.distance >= 1000 ? `${(loc.distance/1000).toFixed(1)}km` : `${loc.distance}m`}
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col bg-white dark:bg-zinc-950 overflow-hidden animate-slide-in-right z-30">
                    <div className="flex items-center p-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0 bg-white dark:bg-zinc-950 shadow-sm">
                        <button
                            type="button"
                            onClick={handleBackToList}
                            className="back-to-list-btn flex items-center text-zinc-700 dark:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-900 font-bold px-3 py-1.5 bg-zinc-100 dark:bg-zinc-950 rounded-lg"
                        >
                            <svg className="back-to-list-arrow w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                            목록으로 돌아가기
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col p-5 overflow-y-auto">
                        <div className="shrink-0 mb-5">
                            <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-1.5 block">
                                {selectedTarget.type === 'myLocation' ? '📍 내 위치 상세 정보' : '🔍 검색된 장소 정보'}
                            </span>
                            <h2 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50 leading-tight break-words">{selectedTarget.placeName}</h2>
                            {selectedTarget.type === 'search' && (
                                <p className="text-base text-zinc-500 mt-2 break-words leading-snug">{selectedTarget.address}</p>
                            )}
                            {activeSort === 'distance' && selectedTarget.distance !== undefined && selectedTarget.type === 'search' && selectedTarget.distance > 0 && (
                                <span className="inline-block mt-3 text-sm bg-sky-50/80 dark:bg-sky-950/30 text-zinc-800 dark:text-zinc-200 px-3 py-1 rounded-full font-bold">
                                    현재 내 위치에서 {selectedTarget.distance >= 1000 ? `${(selectedTarget.distance/1000).toFixed(1)}km` : `${selectedTarget.distance}m`}
                                </span>
                            )}
                        </div>

                        <div className="flex-1 min-h-[350px] w-full bg-zinc-100 dark:bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 relative shadow-inner flex items-center justify-center">
                            {selectedTarget.mapImageUrl ? (
                                <img src={selectedTarget.mapImageUrl} className="absolute inset-0 w-full h-full object-contain p-2" alt="지도 상세" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
                                    <span className="text-sm animate-pulse text-zinc-400 dark:text-zinc-500 font-medium">지도 이미지를 불러오는 중...</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-5 pb-24 border-t border-zinc-100 dark:border-zinc-800 shrink-0 bg-white dark:bg-zinc-950 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                        <button 
                            onClick={() => setIsSheetOpen(true)} 
                            disabled={!selectedTarget.mapImageUrl} 
                            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-2xl font-bold text-lg hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50 transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2"
                        >
                            <span>이 장소 대화방에 공유하기</span>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                        </button>
                    </div>
                </div>
            )}

            {isSheetOpen && selectedTarget && (
                <div className="absolute inset-0 z-[100] flex flex-col justify-end">
                    <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={() => setIsSheetOpen(false)} />
                    <div className="relative bg-white dark:bg-zinc-950 w-full h-[65%] rounded-t-3xl shadow-2xl flex flex-col animate-slide-up">
                        <div className="flex justify-between items-center p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
                            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-50">어느 대화방에 공유할까요?</h3>
                            <button onClick={() => setIsSheetOpen(false)} className="text-zinc-500 dark:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg p-1 transition-colors">닫기</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            {chatRooms.length === 0 ? (
                                <div className="text-center text-zinc-500 dark:text-zinc-400 py-10 font-medium">참여 중인 대화방이 없습니다.</div>
                            ) : (
                                <ul className="flex flex-col gap-2">
                                    {chatRooms.map(room => {
                                        const isSelected = selectedRoomIds.includes(room.roomId);
                                        const title = formatChatRoomListTitle(room.participants);
                                        return (
                                            <li key={room.roomId}>
                                                <button onClick={() => toggleRoomSelection(room.roomId)} className={`w-full flex items-center p-4 rounded-2xl border-2 text-left transition-colors ${isSelected ? 'border-sky-400 bg-sky-50/80 dark:bg-sky-950/30' : 'border-zinc-100 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-800'}`}>
                                                    <div className={`w-6 h-6 rounded-md border-2 mr-4 flex items-center justify-center transition-colors ${isSelected ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900' : 'border-zinc-300 dark:border-zinc-500 bg-white dark:bg-zinc-950'}`}>
                                                        {isSelected && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 12 12"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2 6l3 3 5-5" /></svg>}
                                                    </div>
                                                    <span className="font-bold text-zinc-900 dark:text-zinc-50 text-base flex-1 truncate">{title}</span>
                                                    <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-300 shrink-0 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full">{room.participants.length + 1}명</span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                        {selectedRoomIds.length > 0 && (
                            <div className="p-5 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
                                <button onClick={executeShare} disabled={isSending} className="w-full py-4 bg-sky-500 text-white font-bold rounded-2xl text-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors shadow-lg">
                                    {isSending ? "전송 중..." : `${selectedRoomIds.length}개 대화방에 전송`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            <style jsx>{`
                .back-to-list-btn {
                    border: 1px solid transparent;
                    transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
                }
                .back-to-list-btn:hover {
                    transform: translateX(-2px);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    border-color: rgba(0, 0, 0, 0.08);
                }
                .back-to-list-btn:active {
                    transform: translateX(-1px) scale(0.98);
                }
                .back-to-list-arrow {
                    transition: transform 0.2s ease;
                }
                .back-to-list-btn:hover .back-to-list-arrow {
                    transform: translateX(-3px);
                }
                @media (prefers-color-scheme: dark) {
                    .back-to-list-btn:hover {
                        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
                        border-color: rgba(255, 255, 255, 0.18);
                    }
                }
                .animate-slide-up { animation: slideUp 0.3s ease-out forwards; }
                @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                .animate-slide-in-right { animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            `}</style>
        </div>
    );
}