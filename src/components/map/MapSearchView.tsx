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

interface Props { userId: string; chatRooms: ChatRoomListItemDTO[]; onSendToRooms: (roomIdList: string[], messagePayload: any) => Promise<void>; onClose?: () => void}

interface ShareTarget {
    placeName: string;
    address: string;
    latitude: number;
    longitude: number;
    distance?: number;
    mapImageUrl?: string | null;
}

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

export default function MapSearchView({ userId, chatRooms, onSendToRooms, onClose }: Props) {
    const router = useRouter();

    const inputRef = useRef<HTMLInputElement>(null);
    
    const [keyword, setKeyword] = useState('');
    const [lastSearchedKeyword, setLastSearchedKeyword] = useState('');

    const [isComposing, setIsComposing] = useState(false);
    const composingRef = useRef(false);
    const safeKeywordRef = useRef('')
    
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
    const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
    const [isSending, setIsSending] = useState(false);

    const [showConfirmModal, setShowConfirmModal] = useState(false);

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

        const handleFocus = () => { 
            if (!myCoords && !gpsDenied) updateLocation(); 
        };

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
        if (!selectedTarget && inputRef.current && keyword) {
            inputRef.current.value = keyword;
        }
    }, [selectedTarget, keyword]);

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
        setIsSheetOpen(false); 
        try {
            const res = await fetch(`/api/map?action=image&lat=${loc.latitude}&lng=${loc.longitude}`);
            const data = await res.json();
            if (res.ok) setSelectedTarget(prev => prev?.id === loc.id ? { ...prev, mapImageUrl: data.imageUrl } : prev);
        } catch (e) {}
    };

    const openShareSheetForMyLocation = () => {
        if (!myCoords || !myLocationData) return;
        setShareTarget({
            placeName: "현재 위치", 
            address: myLocationData.address, 
            latitude: myCoords.lat, 
            longitude: myCoords.lng, 
            distance: 0, 
            mapImageUrl: myLocationData.mapImageUrl
        });
        setIsSheetOpen(true); 
    };

    const openShareSheet = (target: SelectedTarget) => {
        setShareTarget({
            placeName: target.placeName,
            address: target.address,
            latitude: target.latitude,
            longitude: target.longitude,
            distance: target.distance,
            mapImageUrl: target.mapImageUrl
        });
        setIsSheetOpen(true);
    };

    const closeShareSheet = () => {
        setIsSheetOpen(false);
        setSelectedRoomIds([]); 
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
        setIsSheetOpen(false);

        setTimeout(() => {
            if (inputRef.current) {
                inputRef.current.value = keyword;
            }
        }, 0);
    };

    const clearSearch = () => {
        setKeyword('');
        safeKeywordRef.current = '';
        setLastSearchedKeyword('');
        setResults([]);
        setIsSearched(false);
        setSelectedTarget(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    const toggleRoomSelection = (roomId: string) => setSelectedRoomIds(prev => prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]);

    const executeShare = async () => {
        const target = shareTarget || selectedTarget;

        if (selectedRoomIds.length === 0 || !target) return;

        const mapMsg = MessageFactory.createMessage('map', {
            placeName: target.placeName, address: target.address,
            latitude: target.latitude, longitude: target.longitude,
            mapImageUrl: target.mapImageUrl || "", distanceFromSender: target.distance
        }, userId, "temp");

        setIsSending(true);
        try {
            await onSendToRooms(selectedRoomIds, mapMsg); 
            
            setIsSheetOpen(false); 
            setSelectedRoomIds([]); 
            setShareTarget(null);
            
            setTimeout(() => {
                setShowConfirmModal(true);
            }, 150);
            
        } catch (error) {
            console.error("공유 실패:", error);
            alert("공유에 실패했습니다. 다시 시도해주세요.");
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
                                    onChange={e => { 
                                        const val = e.target.value;
                                        setKeyword(val); 
                                        safeKeywordRef.current = val;
                                        if (val.trim() === '') { setResults([]); setIsSearched(false); }
                                    }} 
                                    
                                    onCompositionStart={() => {
                                        setIsComposing(true);
                                        composingRef.current = true;
                                    }}
                                    onCompositionEnd={(e) => { 
                                        setIsComposing(false);
                                        composingRef.current = false;
                                        setKeyword(e.currentTarget.value);
                                        safeKeywordRef.current = e.currentTarget.value;
                                    }}
                                    
                                    onBlur={() => {
                                        if (composingRef.current) {
                                            const preservedText = safeKeywordRef.current;
                                            setTimeout(() => {
                                                setKeyword(preservedText);
                                                if (inputRef.current) {
                                                    inputRef.current.value = preservedText;
                                                }
                                            }, 0);
                                        }
                                    }}
                                    
                                    onKeyDown={e => { 
                                        if (e.key === 'Enter' && !composingRef.current && keyword.trim() !== '') {
                                            handleSearchClick();
                                        } 
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
                                        onClick={clearSearch}
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

                    <div className="flex-1 flex flex-col overflow-hidden relative border-t border-zinc-100 dark:border-zinc-800 bg-white">
                        {isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-20 backdrop-blur-sm gap-3">
                                <div className="w-8 h-8 border-4 border-zinc-200 border-t-sky-500 rounded-full animate-spin"></div>
                                <span className="text-sm font-bold text-zinc-800">장소 검색 중...</span>
                            </div>
                        )}

                        {isNoResults ? (
                            <div className="w-full p-10 flex flex-col items-center justify-center text-zinc-400 h-full overflow-y-auto custom-scrollbar">
                                <span className="text-4xl mb-4">🔍</span><span className="text-sm font-medium">검색 결과가 없습니다.</span>
                            </div>
                        ) : isDefaultMode && gpsLoading ? (
                            <div className="w-full p-10 flex flex-col items-center justify-center text-zinc-400 h-full overflow-y-auto custom-scrollbar"><span className="text-sm font-medium animate-pulse">위치를 찾는 중입니다...</span></div>
                        ) : isDefaultMode && gpsDenied ? (
                            <div className="w-full p-10 flex flex-col items-center justify-center text-zinc-400 h-full overflow-y-auto custom-scrollbar">
                                <span className="text-4xl mb-4 opacity-50">🚫</span>
                                <span className="text-sm font-medium text-center text-zinc-500 leading-relaxed">
                                    위치 권한이 없습니다.<br/>브라우저 설정에서 위치 권한을 허용해 주시거나,<br/>상단의 검색창에 장소명을 직접 입력해 주세요.
                                </span>
                            </div>
                        ) : isDefaultMode && myLocationData && myCoords ? (
                            
                            <div className="w-full flex-1 flex flex-col bg-white animate-fade-in shadow-sm h-full">
                                <div className="flex flex-col items-center w-full py-3 shrink-0 z-10 border-b border-zinc-100 bg-white">
                                    <span className="text-xs font-extrabold text-sky-600 mb-1.5 bg-sky-50 px-4 py-1.5 rounded-full border border-sky-100 flex items-center gap-1.5 shadow-sm">
                                         현재 내 위치
                                    </span>
                                    <span className="text-lg font-bold text-zinc-900 text-center leading-tight break-words px-2">{myLocationData.address}</span>
                                </div>
                                
                                <div className="flex-1 w-full relative bg-zinc-50 flex items-center justify-center overflow-hidden">
                                    {myLocationData.mapImageUrl ? (
                                        <img src={myLocationData.mapImageUrl} className="w-full h-full object-contain" alt="내 위치 지도" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-sm animate-pulse text-zinc-400 font-medium">지도를 불러올 수 없습니다.</span>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="p-3 bg-white border-t border-zinc-100 flex justify-center shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-10">
                                    <button 
                                        onClick={openShareSheetForMyLocation}
                                        className="w-[90%] max-w-sm py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-full font-bold text-base shadow-lg hover:from-indigo-600 hover:to-violet-600 transition-all flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        현재 위치 대화방에 공유하기
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <ul className="divide-y divide-zinc-100 flex-1 overflow-y-auto custom-scrollbar">
                                {results.map((loc) => (
                                    <li key={loc.id} onClick={() => handleSelectLocation(loc)} className="p-4 cursor-pointer flex justify-between hover:bg-zinc-50 transition-colors active:bg-zinc-100 border-l-4 border-transparent hover:border-sky-400">
                                        <div className="min-w-0 pr-4 flex-1">
                                            <p className="text-base font-bold text-zinc-900 break-words leading-tight">{loc.placeName}</p>
                                            <p className="text-sm text-zinc-500 mt-1.5 break-words leading-snug">{loc.address}</p>
                                        </div>
                                        <div className="flex flex-col items-end justify-center shrink-0 ml-2">
                                            {activeSort === 'distance' && loc.distance !== undefined && (
                                                <span className="text-xs bg-zinc-100 px-2.5 py-1 rounded-md text-zinc-600 font-bold whitespace-nowrap">
                                                    {loc.distance >= 1000 ? `${(loc.distance/1000).toFixed(1)}km` : `${loc.distance}m`}
                                                </span>
                                            )}
                                            <svg className="w-5 h-5 mt-2 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7-7" /></svg>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            ) : (

                <div className="flex-1 flex flex-col bg-white overflow-hidden animate-slide-in-right z-30 relative">
                    
                    <div className="px-3 py-2 shrink-0 bg-white shadow-sm z-20 flex justify-between items-center border-b border-zinc-200">
                        <button onClick={handleBackToList} className="px-3 py-1.5 flex items-center bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold rounded-lg transition-colors text-sm shadow-sm shrink-0">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                            목록으로
                        </button>

                        <button 
                            onClick={() => openShareSheet(selectedTarget)} 
                            disabled={!selectedTarget.mapImageUrl} 
                            className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg font-bold text-sm shadow-md hover:from-indigo-600 hover:to-violet-600 hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center gap-1.5 shrink-0"
                        >
                            대화방 공유
                        </button>
                    </div>
                    
                    <div className="px-4 py-2.5 shrink-0 bg-white z-10 flex flex-col relative border-b border-zinc-100">
                        <span className="text-[10px] font-bold text-sky-600 mb-0.5">{selectedTarget.type === 'myLocation' ? '📍 현재 내 위치' : '🔍 검색된 장소'}</span>
                        <h2 className="text-lg font-extrabold text-zinc-900 leading-tight truncate">{selectedTarget.placeName}</h2>
                        <p className="text-[11px] font-medium text-zinc-500 mt-0.5 truncate">{selectedTarget.address}</p>
                    </div>

                    <div className="flex-1 w-full bg-zinc-50 relative flex items-center justify-center overflow-hidden">
                        {selectedTarget.mapImageUrl ? (
                            <img src={selectedTarget.mapImageUrl} className="w-full h-full object-contain" alt="지도 상세" />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-sm animate-pulse text-zinc-400 font-medium bg-white px-4 py-2 rounded-full shadow-sm">지도 이미지를 불러오는 중...</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isSheetOpen && (shareTarget || selectedTarget) && (
                <div className="absolute inset-0 z-[100] flex flex-col justify-end">
                    <div className="absolute inset-0 bg-black/50 transition-opacity animate-fade-in" onClick={closeShareSheet} />
                    <div className="relative bg-white w-full max-h-[70%] rounded-t-3xl shadow-2xl flex flex-col animate-slide-up pb-6">
                        <div className="flex justify-between items-center p-4 border-b border-zinc-100 shrink-0">
                            <h3 className="font-bold text-lg text-zinc-900 pl-2">어느 대화방에 공유할까요?</h3>
                            <button onClick={closeShareSheet} className="text-zinc-500 hover:bg-zinc-100 rounded-lg p-2 font-bold transition-colors">닫기</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                            {chatRooms.length === 0 ? (
                                <div className="text-center text-zinc-500 py-6 font-medium">참여 중인 대화방이 없습니다.</div>
                            ) : (
                                <ul className="flex flex-col">
                                    {chatRooms.map(room => {
                                        const isSelected = selectedRoomIds.includes(room.roomId);
                                        const title = formatChatRoomListTitle(room.participants);
                                        return (
                                            <li key={room.roomId} className="border-b border-zinc-50 last:border-0">
                                                <button onClick={() => toggleRoomSelection(room.roomId)} className={`w-full flex items-center px-4 py-3.5 transition-colors ${isSelected ? 'bg-sky-50/80' : 'bg-white hover:bg-zinc-50'}`}>
                                                    <div className={`w-5 h-5 rounded-md border-2 mr-3 flex items-center justify-center transition-colors ${isSelected ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-zinc-300 bg-white'}`}>
                                                        {isSelected && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 12 12"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2 6l3 3 5-5" /></svg>}
                                                    </div>
                                                    <span className="font-bold text-zinc-900 text-sm flex-1 truncate text-left">{title}</span>
                                                    <span className="ml-2 text-[11px] font-bold text-zinc-500 shrink-0 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full">{room.participants.length + 1}명</span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                        {selectedRoomIds.length > 0 && (
                            <div className="p-4 flex justify-center shrink-0 border-t border-zinc-100 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] bg-white">

                                <button 
                                    onClick={executeShare} 
                                    disabled={isSending} 
                                    className="px-12 py-3.5 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold rounded-full text-base shadow-lg hover:from-indigo-600 hover:to-violet-600 hover:scale-[1.02] disabled:opacity-50 transition-all flex items-center justify-center gap-2 w-[85%] max-w-sm"
                                >
                                    {isSending ? "전송 중..." : `${selectedRoomIds.length}개 방에 전송`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showConfirmModal && (
                <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/60 animate-fade-in px-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden animate-slide-up flex flex-col">
                        <div className="p-6 flex flex-col items-center text-center">
                            <div className="w-14 h-14 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-full flex items-center justify-center mb-4 shadow-md">
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-50 mb-2">FlashTalk</h3>
                            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                선택한 대화방에 지도를 공유 완료했습니다<br/>메인 화면으로 이동하시겠습니까?
                            </p>
                        </div>
                        <div className="flex border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">

                            <button 
                                onClick={() => setShowConfirmModal(false)}
                                className="flex-1 py-4 text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border-r border-zinc-100 dark:border-zinc-800"
                            >
                                닫기
                            </button>

                            <button 
                                onClick={() => {
                                    setShowConfirmModal(false);
                                    if (onClose) {
                                        onClose();
                                    } else {
                                        router.push('/main');
                                    }
                                }}
                                className="flex-1 py-4 text-sm font-extrabold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
                .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
                .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .animate-slide-in-right { animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            `}</style>
        </div>
    );
}