'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { UserSearchResultDTO } from '@/entities/User';
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from '@/lib/session';
import { resetBrowserRealtimeAuth } from '@/lib/supabase-realtime-auth';
import { createClient } from '@supabase/supabase-js';

type TabType = 'ALL' | 'ONLINE' | 'OFFLINE';

export default function AdminView() {
    const router = useRouter();
    const [users, setUsers] = useState<UserSearchResultDTO[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [searchUniversityName, setSearchUniversityName] = useState('');

    const [searchKeyword, setSearchKeyword] = useState('');
    
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<TabType>('ALL');

    const [deleteModalStep, setDeleteModalStep] = useState<0 | 1 | 2>(0);
    const [targetUser, setTargetUser] = useState<UserSearchResultDTO | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [logoutPending, setLogoutPending] = useState(false);

    const getToken = () => {
        try { return sessionStorage.getItem(CLIENT_JWT_KEY) || ''; } 
        catch { return ''; }
    };

    const fetchUsers = useCallback(async () => {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch('/api/admin', { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (res.ok && data.users) { setUsers(data.users); }
        } catch (e) { console.error("Admin fetch error", e); } 
        finally { setIsLoading(false); }
    }, []);

    useEffect(() => {
        let isMounted = true;
        let isolatedSupabase: any = null;
        let presenceChannel: any = null;
        let dbChannel: any = null;

        const initAdminSockets = async () => {
            await fetchUsers(); 

            const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
            const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
            isolatedSupabase = createClient(url, key);

            presenceChannel = isolatedSupabase.channel('global_presence')
                .on('presence', { event: 'sync' }, () => {
                    if (!isMounted) return;
                    const state = presenceChannel.presenceState();
                    const currentlyOnlineIds = new Set<string>();
                    for (const k in state) {
                        state[k].forEach((p: any) => { if (p.userId) currentlyOnlineIds.add(p.userId); });
                    }
                    setUsers(prev => prev.map(u => ({ ...u, isOnline: currentlyOnlineIds.has(u.userId) })));
                })
                .on('broadcast', { event: 'USER_LIST_CHANGED' }, () => {
                    if (isMounted) fetchUsers();
                })
                .subscribe();

            const uniqueDbChannelName = `admin_db_changes_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            dbChannel = isolatedSupabase.channel(uniqueDbChannelName)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'UserPresence' }, (payload: any) => {
                    if (!isMounted) return;
                    const { userId, isOnline } = payload.new;
                    setUsers(prev => prev.map(u => u.userId === userId ? { ...u, isOnline } : u));
                })
                .subscribe();
        };

        initAdminSockets();

        return () => {
            isMounted = false;
            if (isolatedSupabase) {
                if (presenceChannel) isolatedSupabase.removeChannel(presenceChannel);
                if (dbChannel) isolatedSupabase.removeChannel(dbChannel);
            }
        };
    }, [fetchUsers]);

    const filteredUsers = useMemo(() => {
        return users.filter(user => {
            const matchesUni = searchUniversityName.trim() === '' || user.universityName.includes(searchUniversityName.trim());
            const matchesKeyword = searchKeyword.trim() === '' || user.name.includes(searchKeyword.trim()) || user.studentId.includes(searchKeyword.trim());
            const matchesTab = activeTab === 'ALL' ? true : activeTab === 'ONLINE' ? user.isOnline : !user.isOnline;
            
            return matchesUni && matchesKeyword && matchesTab;
        });
    }, [users, searchUniversityName, searchKeyword, activeTab]);

    const openDeleteModal = (user: UserSearchResultDTO) => {
        setTargetUser(user);
        setDeleteModalStep(1); 
    };

    const executeDelete = async () => {
        if (!targetUser) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/admin?userId=${targetUser.userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (res.ok) {
                setUsers(prev => prev.filter(u => u.userId !== targetUser.userId));
                alert(`${targetUser.name}님이 성공적으로 탈퇴 처리되었습니다.`);
                setDeleteModalStep(0); 
                setTargetUser(null);
            } else { alert("삭제에 실패했습니다."); }
        } catch (e) { alert("네트워크 오류 발생"); } 
        finally { setIsDeleting(false); }
    };

    const handleAdminLogout = async () => {
        setLogoutPending(true);
        try {
            await fetch("/api/users/logout", {
                method: "POST",
                headers: { Authorization: `Bearer ${getToken()}` },
            });
        } catch { console.warn("Logout request failed"); } 
        finally { 
            resetBrowserRealtimeAuth();
            sessionStorage.removeItem(CLIENT_JWT_KEY);
            sessionStorage.removeItem(CLIENT_USER_KEY);
            router.replace("/login");
            setLogoutPending(false); 
        }
    };

    const isSearchEmpty = searchUniversityName.trim() === '' && searchKeyword.trim() === '';

    const handleClearSearch = () => {
        setSearchUniversityName('');
        setSearchKeyword('');
    };

    return (
        <div className="min-h-screen bg-zinc-50 flex flex-col font-sans text-zinc-900">
            <header className="bg-zinc-900 text-white h-16 flex items-center justify-between px-6 shrink-0 shadow-md z-10">
                <div className="flex items-center gap-3">
                    <span className="text-xl font-black tracking-tight">FlashTalk ADMIN</span>
                    <span className="bg-red-500 text-[10px] font-bold px-2 py-0.5 rounded-sm tracking-widest animate-pulse">MASTER</span>
                </div>
                <button 
                    onClick={handleAdminLogout} 
                    disabled={logoutPending}
                    className="text-sm font-semibold text-zinc-300 hover:text-white transition-colors bg-white/10 px-4 py-1.5 rounded-lg hover:bg-white/20 disabled:opacity-50"
                >
                    {logoutPending ? "처리중..." : "로그아웃"}
                </button>
            </header>

            <main className="flex-1 max-w-5xl w-full mx-auto p-6 flex flex-col gap-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-200 flex flex-col sm:flex-row gap-4 items-end">
                    
                    <label className="flex-1 flex flex-col gap-1.5 w-full">
                        <span className="text-[13px] font-bold text-zinc-700 ml-1">학교명</span>
                        <div className="relative flex items-center w-full">
                            <input 
                                type="text" 
                                value={searchUniversityName}
                                onChange={(e) => setSearchUniversityName(e.target.value)}
                                placeholder="ex) 한국대"
                                className="w-full bg-zinc-100 px-4 py-3.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm text-zinc-900 placeholder:text-zinc-400 border border-transparent focus:border-indigo-300 focus:bg-white shadow-inner"
                            />
                            {searchUniversityName && (
                                <button type="button" onClick={() => setSearchUniversityName('')} className="absolute right-3 text-zinc-400 hover:text-zinc-600 transition-colors p-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            )}
                        </div>
                    </label>

                    <label className="flex-1 flex flex-col gap-1.5 w-full">
                        <span className="text-[13px] font-bold text-zinc-700 ml-1">학번 또는 이름</span>
                        <div className="relative flex items-center w-full">
                            <input 
                                type="text" 
                                value={searchKeyword}
                                onChange={(e) => setSearchKeyword(e.target.value)}
                                placeholder="ex) 20260001 또는 김철수"
                                className="w-full bg-zinc-100 px-4 py-3.5 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-sm text-zinc-900 placeholder:text-zinc-400 border border-transparent focus:border-indigo-300 focus:bg-white shadow-inner"
                            />
                            {searchKeyword && (
                                <button type="button" onClick={() => setSearchKeyword('')} className="absolute right-3 text-zinc-400 hover:text-zinc-600 transition-colors p-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            )}
                        </div>
                    </label>

                    <div className="flex gap-2 w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
                        <button 
                            type="button"
                            onClick={handleClearSearch}
                            disabled={isSearchEmpty}
                            title="모든 검색어 지우기"
                            className="flex items-center justify-center h-[52px] w-[52px] bg-zinc-100 border border-zinc-200 text-zinc-500 rounded-xl hover:bg-zinc-200 hover:text-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shrink-0"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        <button 
                            type="button"
                            disabled={isSearchEmpty}
                            className="flex-1 sm:flex-none h-[52px] px-8 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl font-black text-[15px] hover:from-indigo-600 hover:to-violet-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md active:scale-95 flex items-center justify-center gap-2"
                        >
                            <span>검색</span>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </button>
                    </div>
                </div>

                <div className="flex bg-white rounded-xl shadow-sm border border-zinc-200 p-1 shrink-0">
                    <button onClick={() => setActiveTab('ALL')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'ALL' ? 'bg-zinc-900 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100'}`}>
                        전체 사용자 ({users.length})
                    </button>
                    <button onClick={() => setActiveTab('ONLINE')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'ONLINE' ? 'bg-emerald-500 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100'}`}>
                        🟢 현재 접속 중 ({users.filter(u => u.isOnline).length})
                    </button>
                    <button onClick={() => setActiveTab('OFFLINE')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === 'OFFLINE' ? 'bg-zinc-400 text-white shadow-md' : 'text-zinc-500 hover:bg-zinc-100'}`}>
                        ⚪ 미접속 ({users.filter(u => !u.isOnline).length})
                    </button>
                </div>

                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col">
                    <div className="bg-zinc-100 px-6 py-3 border-b border-zinc-200 flex items-center text-xs font-bold text-zinc-500 shrink-0">
                        <div className="w-1/4">이름 (학번)</div>
                        <div className="w-1/4">학교</div>
                        <div className="w-1/4 text-center">상태</div>
                        <div className="w-1/4 text-right">관리</div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {isLoading ? (
                            <div className="p-10 text-center text-zinc-400 font-medium">데이터를 불러오는 중입니다...</div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="p-10 text-center flex flex-col items-center gap-3">
                                <span className="text-4xl">📂</span>
                                <span className="text-zinc-500 font-bold">조건에 일치하는 사용자가 없습니다.</span>
                            </div>
                        ) : (
                            <ul className="divide-y divide-zinc-100">
                                {filteredUsers.map(user => (
                                    <li key={user.userId} className="px-6 py-4 flex items-center hover:bg-zinc-50 transition-colors animate-fade-in">
                                        <div className="w-1/4 flex flex-col">
                                            <span className="font-extrabold text-zinc-900">{user.name}</span>
                                            <span className="text-xs text-zinc-500 font-mono mt-0.5">{user.studentId}</span>
                                        </div>
                                        <div className="w-1/4 text-sm font-medium text-zinc-600">
                                            {user.universityName}
                                        </div>
                                        <div className="w-1/4 flex justify-center">
                                            <span className={`px-2.5 py-1 text-[11px] font-extrabold rounded-md flex items-center gap-1.5 w-fit shadow-sm border transition-colors duration-300 ${user.isOnline ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${user.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`}></span>
                                                {user.isOnline ? 'ONLINE' : 'OFFLINE'}
                                            </span>
                                        </div>
                                        <div className="w-1/4 flex justify-end">
                                            <button 
                                                onClick={() => openDeleteModal(user)}
                                                className="px-4 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-lg text-xs font-bold transition-colors shadow-sm"
                                            >
                                                강제 탈퇴
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </main>

            {deleteModalStep > 0 && targetUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
                        <div className="bg-red-500 p-6 flex flex-col items-center justify-center text-white relative overflow-hidden">
                            <div className="absolute inset-0 bg-black/10 pattern-diagonal-lines opacity-20"></div>
                            <span className="text-5xl mb-3 relative z-10">⚠️</span>
                            <h2 className="text-2xl font-black tracking-tight relative z-10">회원 영구 탈퇴</h2>
                        </div>
                        
                        <div className="p-6 flex flex-col gap-4 text-center">
                            {deleteModalStep === 1 ? (
                                <>
                                    <p className="text-lg font-bold text-zinc-800 leading-snug">
                                        <span className="text-red-600 font-black px-1">[{targetUser.name}]</span> 사용자를<br/>정말 강제 탈퇴시키겠습니까?
                                    </p>
                                    <p className="text-sm text-zinc-500 bg-zinc-50 p-3 rounded-xl border border-zinc-100">이 작업은 데이터베이스에서 해당 사용자의 모든 정보를 삭제합니다.</p>
                                    <div className="flex gap-2 mt-4">
                                        <button onClick={() => setDeleteModalStep(0)} className="flex-1 py-4 bg-zinc-100 text-zinc-700 font-bold rounded-xl hover:bg-zinc-200 transition-colors">취소</button>
                                        <button onClick={() => setDeleteModalStep(2)} className="flex-1 py-4 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors shadow-md shadow-red-200">네, 진행합니다</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-lg font-bold text-zinc-800 leading-snug">
                                        이 작업은 절대 되돌릴 수 없습니다.<br/>최종 확인하셨습니까?
                                    </p>
                                    <p className="text-sm text-red-600 font-bold animate-pulse bg-red-50 p-3 rounded-xl border border-red-100">※ 삭제된 데이터는 어떤 방법으로도 복구할 수 없습니다.</p>
                                    <div className="flex gap-2 mt-4">
                                        <button onClick={() => setDeleteModalStep(0)} disabled={isDeleting} className="flex-1 py-4 bg-zinc-100 text-zinc-700 font-bold rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50">안전하게 취소</button>
                                        <button
                                            onClick={executeDelete}
                                            disabled={isDeleting}
                                            className="flex-1 py-4 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors shadow-md shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isDeleting ? "삭제 처리 중..." : "최종 영구 삭제"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e4e4e7; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
                .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .pattern-diagonal-lines { background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px); }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            `}</style>
        </div>
    );
}
