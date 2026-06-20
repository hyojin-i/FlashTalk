"use client";

import type { ChatRoomListItemDTO } from "@/entities/ChatRoomListItem";
import type { ParticipantsDTO } from "@/entities/Participants";
import type { SessionUserDTO, UserSearchResultDTO } from "@/entities/User";
import {
  createUserPresenceChannel,
  INVITE_TO_ROOM_EVENT,
  type InviteToRoomPayload,
  normalizeUserId,
} from "@/lib/presence-channel";
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import {
  normalizeStudentId,
  validateStudentId,
} from "@/lib/student-id-validation";
import { useGlobalSocket } from "@/store/GlobalSocketProvider";
import {
  ensureBrowserRealtimeAuth,
  resetBrowserRealtimeAuth,
} from "@/lib/supabase-realtime-auth";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapSearchView from "@/components/map/MapSearchView";
import AiQuestionView from "@/components/ai/AIQuestionView";

const PRESENCE_HEARTBEAT_MS = 60 * 1000;
const INVITE_TOAST_MS = 10 * 1000;

const inputClassName =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50";

function readStoredUser(): SessionUserDTO | null {
  try {
    const raw = sessionStorage.getItem(CLIENT_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.userId !== "string" || !o.userId) return null;
    return parsed as SessionUserDTO;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  try {
    const token = sessionStorage.getItem(CLIENT_JWT_KEY);
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

async function postPresenceHeartbeat(token: string): Promise<boolean> {
  try {
    const res = await fetch("/api/presence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ heartbeat: true }),
    });
    return res.ok;
  } catch (error) {
    // 네트워크 단절, 페이지 이동 중 취소 등 브라우저 레벨 에러 발생 시 조용히 무시(false 반환)
    console.warn("Heartbeat fetch failed (ignored):", error);
    return false;
  }
}

function nameInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0) : "?";
}

function chatTypeLabel(selectedCount: number): string {
  if (selectedCount <= 1) return "1:1 채팅";
  return "그룹 채팅";
}

/** 사이드바 채팅방 목록 표시용 제목 (본인 제외 참가자 목록 기준) */
function formatChatRoomListTitle(participants: ParticipantsDTO[]): string {
  const totalParticipants = participants.length + 1;
  if (participants.length === 0) return "채팅";

  const names = participants.map((p) => p.name);
  const othersCount = totalParticipants - 2;

  if (names.length === 1 || othersCount <= 0) {
    if (names.length >= 2 && othersCount <= 0) {
      return `${names[0]}, ${names[1]}`;
    }
    return names[0];
  }

  const first = names[0];
  const second = names[1] ?? names[0];
  return `${first}, ${second} 외 ${othersCount}명`;
}

function ChatBubbleIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

export default function MainView() {
  const router = useRouter();
  const {
    latestMessages,
    unreadCounts,
    roomLeaveUi,
    refreshRooms,
    ensureRoomChannel,
    receiveMessage,
    disconnectAllSockets,
    setPendingInviteEntryRoomId,
  } = useGlobalSocket();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handleInviteBroadcastRef = useRef<(payload: unknown) => void>(() => {});

  const [currentUser, setCurrentUser] = useState<SessionUserDTO | null>(null);

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const [searchStudentId, setSearchStudentId] = useState("");
  const [searchUniversityName, setSearchUniversityName] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<UserSearchResultDTO[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserSearchResultDTO[]>([]);

  const [createChatPending, setCreateChatPending] = useState(false);
  const [createChatError, setCreateChatError] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatRooms, setChatRooms] = useState<ChatRoomListItemDTO[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const [inviteToast, setInviteToast] = useState<{
    roomId: string;
    inviterName: string;
  } | null>(null);

  const [globalMapOpen, setGlobalMapOpen] = useState(false);
  const [globalAiOpen, setGlobalAiOpen] = useState(false);

  useEffect(() => {
      window.history.replaceState({ tab: "home" }, "", window.location.href);

      const handlePopState = (e: PopStateEvent) => {
          const state = e.state;
          if (state?.tab === "map") {
              setGlobalMapOpen(true);
              setGlobalAiOpen(false);
          } else if (state?.tab === "ai") {
              setGlobalAiOpen(true);
              setGlobalMapOpen(false);
          } else {
              setGlobalMapOpen(false);
              setGlobalAiOpen(false);
          }
      };

      window.addEventListener("popstate", handlePopState);
      return () => window.removeEventListener("popstate", handlePopState);
  }, []); 

  const totalUnreadCount = useMemo(() => {
return Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);
}, [unreadCounts]);

  const globalMapOpenRef = useRef(globalMapOpen);
  const globalAiOpenRef = useRef(globalAiOpen);
  globalMapOpenRef.current = globalMapOpen;
  globalAiOpenRef.current = globalAiOpen;

  const handleNavigate = useCallback((target: 'home' | 'map' | 'ai') => {
      if (target === 'home') {
          window.history.pushState({ tab: "home" }, "", window.location.href);
          setGlobalMapOpen(false);
          setGlobalAiOpen(false);
      } else if (target === 'map') {
          if (!globalMapOpen) {
              window.history.pushState({ tab: "map" }, "", window.location.href);
              setGlobalMapOpen(true);
              setGlobalAiOpen(false);
          }
      } else if (target === 'ai') {
          if (!globalAiOpen) {
              window.history.pushState({ tab: "ai" }, "", window.location.href);
              setGlobalAiOpen(true);
              setGlobalMapOpen(false);
          }
      }
  }, [globalMapOpen, globalAiOpen]);

  const visibleUsers = useMemo(
    () =>
      currentUser
        ? searchResults.filter((u) => u.userId !== currentUser.userId)
        : searchResults,
    [searchResults, currentUser]
  );

  useEffect(() => {
    const token = readStoredToken();
    const user = readStoredUser();
    if (!token || !user) {
      router.replace("/login");
      return;
    }
    setCurrentUser(user);
    setSearchUniversityName(user.universityName);

    let cancelled = false;
    let heartbeatId: number | undefined;
    const supabase = getBrowserSupabaseClient();

    void (async () => {
      if (cancelled) return;

      await ensureBrowserRealtimeAuth(supabase);
      if (cancelled) return;

      const userId = normalizeUserId(user.userId);
      const channel = createUserPresenceChannel(supabase, userId);
      channelRef.current = channel;

      channel
        .on(
          "broadcast",
          { event: INVITE_TO_ROOM_EVENT },
          ({ payload }) => {
            handleInviteBroadcastRef.current(payload);
          }
        )
        .subscribe(async (status, err) => {
          if (cancelled) return;

          if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            console.warn("[MainView] realtime channel error", status, err);
            if (status === "CHANNEL_ERROR") {
              const message =
                err instanceof Error ? err.message : String(err ?? "");
              if (
                message.includes("JwtSignature") ||
                message.includes("JWT")
              ) {
                try {
                  sessionStorage.removeItem(CLIENT_JWT_KEY);
                  sessionStorage.removeItem(CLIENT_USER_KEY);
                } catch {
                  /* ignore */
                }
                router.replace("/login?error=session_expired");
              }
            }
            return;
          }

          if (status !== "SUBSCRIBED") return;

          try {
            await channel.track({ isOnline: true, userId });
          } catch (trackErr) {
            console.warn("[MainView] presence track failed", trackErr);
          }
        });

      heartbeatId = window.setInterval(() => {
        void postPresenceHeartbeat(token);
      }, PRESENCE_HEARTBEAT_MS);
    })();

    return () => {
      cancelled = true;
      if (heartbeatId !== undefined) window.clearInterval(heartbeatId);
      const ch = channelRef.current;
      channelRef.current = null;
      if (!ch) return;

      void (async () => {
        try {
          await ch.untrack();
        } catch (untrackErr) {
          console.warn("[MainView] cleanup untrack failed", untrackErr);
        }
        try {
          await supabase.removeChannel(ch);
        } catch (removeErr) {
          console.warn("[MainView] cleanup removeChannel failed", removeErr);
        }
      })();
    };
  }, [router]);

  function loadChatRoomList(): void {
    const token = readStoredToken();
    if (!token) return;

    setRoomsLoading(true);
    setRoomsError(null);
    void (async () => {
      try {
        const res = await fetch("/api/chat", {
          headers: { Authorization: `Bearer ${token}` },
        });

        let data: {
          ok?: boolean;
          rooms?: ChatRoomListItemDTO[];
          error?: string;
        } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          /* ignore */
        }

        if (!res.ok || !data.ok || !Array.isArray(data.rooms)) {
          setRoomsError(
            typeof data.error === "string"
              ? data.error
              : "채팅방 목록을 불러오지 못했습니다."
          );
          setChatRooms([]);
          return;
        }

        setChatRooms(data.rooms);
        refreshRooms();
      } catch {
        setRoomsError("네트워크 오류가 발생했습니다.");
        setChatRooms([]);
      } finally {
        setRoomsLoading(false);
      }
    })();
  }

  useEffect(() => {
    if (!currentUser) return;
    loadChatRoomList();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const mainUrl = "/main";
    window.history.pushState(null, "", mainUrl);

    const handlePopState = () => {
      if (globalMapOpenRef.current || globalAiOpenRef.current) return;

      if (window.location.pathname !== "/main") {
        router.replace(mainUrl);
      }
      window.history.pushState(null, "", mainUrl);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentUser, router]);

  handleInviteBroadcastRef.current = (rawPayload: unknown) => {
    const invite = rawPayload as InviteToRoomPayload;
    if (typeof invite?.roomId !== "string") return;

    const inviterName =
      typeof invite.inviterName === "string" && invite.inviterName.trim()
        ? invite.inviterName.trim()
        : "알 수 없음";

    loadChatRoomList();
    setInviteToast({ roomId: invite.roomId, inviterName });
  };

  useEffect(() => {
    if (!inviteToast) return;
    const timeoutId = window.setTimeout(() => {
      setInviteToast(null);
    }, INVITE_TOAST_MS);
    return () => window.clearTimeout(timeoutId);
  }, [inviteToast]);

  function toggleUserSelection(user: UserSearchResultDTO): void {
    setCreateChatError(null);
    setSelectedUsers((prev) => {
      if (prev.some((u) => u.userId === user.userId)) {
        return prev.filter((u) => u.userId !== user.userId);
      }
      if (!user.isOnline) return prev;
      return [...prev, user];
    });
  }

  function deselectUser(userId: string): void {
    setCreateChatError(null);
    setSelectedUsers((prev) => prev.filter((u) => u.userId !== userId));
  }

  function clearAllSelectedUsers(): void {
    setCreateChatError(null);
    setSelectedUsers([]);
  }

  function setLatestSearchResult(result: UserSearchResultDTO): void {
    setSearchResults([result]);
  }

  function requestSearchUser(): void {
    setSearchError(null);
    setCreateChatError(null);

    const studentIdError = validateStudentId(searchStudentId);
    if (studentIdError) {
      setSearchError(studentIdError);
      return;
    }

    const studentId = normalizeStudentId(searchStudentId);
    const universityName = searchUniversityName.trim();

    if (!universityName) {
      setSearchError("학교 이름을 입력해 주세요.");
      return;
    }

    setSearchStudentId(studentId);
    setSearchPending(true);
    void (async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId, universityName }),
        });

        let data: {
          ok?: boolean;
          result?: UserSearchResultDTO;
          error?: string;
        } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          /* ignore */
        }

        if (res.status === 404) {
          setSearchError(data.error ?? "해당 사용자가 없습니다.");
          return;
        }

        if (!res.ok || !data.ok || !data.result) {
          setSearchError(
            typeof data.error === "string"
              ? data.error
              : "검색에 실패했습니다. 잠시 후 다시 시도해 주세요."
          );
          return;
        }

        setLatestSearchResult(data.result);
      } catch {
        setSearchError("네트워크 오류가 발생했습니다.");
      } finally {
        setSearchPending(false);
      }
    })();
  }

  async function requestCreateChatRoom(
    participantUserIds: string[]
  ): Promise<string | null> {
    const token = readStoredToken();
    if (!token) {
      router.replace("/login");
      return null;
    }

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ participantUserIds }),
    });

    let data: { roomId?: string; error?: string; ok?: boolean } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* ignore */
    }

    if (!res.ok || typeof data.roomId !== "string") {
      throw new Error(
        typeof data.error === "string"
          ? data.error
          : "채팅방 생성에 실패했습니다."
      );
    }

    return data.roomId;
  }

  function navigateToChatView(roomId: string): void {
    router.push(`/chat/${roomId}`);
  }

  function handleStartChat(): void {
    if (selectedUsers.length === 0 || createChatPending) return;
    setCreateChatError(null);
    setCreateChatPending(true);
    void (async () => {
      try {
        const roomId = await requestCreateChatRoom(
          selectedUsers.map((u) => u.userId)
        );
        if (roomId) {
          await ensureRoomChannel(roomId);
          refreshRooms();
          loadChatRoomList();
          navigateToChatView(roomId);
        }
      } catch (e) {
        setCreateChatError(
          e instanceof Error ? e.message : "채팅방 생성에 실패했습니다."
        );
      } finally {
        setCreateChatPending(false);
      }
    })();
  }

  async function confirmLogout() {
    if (logoutPending) return;
    setLogoutError(null);
    setLogoutPending(true);

    const token = readStoredToken();

    // 서버 로그아웃은 best-effort: 토큰이 없거나 만료되어 401이 떠도
    // 사용자는 사실상 로그아웃 상태이므로 로컬 정리 후 로그인 페이지로 이동한다.
    try {
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      await fetch("/api/users/logout", {
        method: "POST",
        headers,
      });
    } catch {
      /* 네트워크 오류가 나도 로컬 세션은 정리하고 로그인 페이지로 보낸다 */
    }

    // 로컬 세션을 먼저 비워 어떤 경우에도 인증 상태가 남지 않도록 한다.
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    resetBrowserRealtimeAuth();
    channelRef.current = null;
    setInviteToast(null);
    setChatRooms([]);
    setLogoutModalOpen(false);

    // 소켓 정리는 best-effort로 시도하되, 행(hang)이 걸려도 리다이렉트를
    // 막지 않도록 타임아웃을 둔다. (removeAllChannels 가 멈추는 경우 대비)
    try {
      await Promise.race([
        disconnectAllSockets(),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    } catch {
      /* ignore */
    }

    // 전체 페이지를 새로 로드해 메모리에 남은 소켓/상태까지 확실히 정리한다.
    window.location.replace("/login");
  }

  const selectionCount = selectedUsers.length;
  const showCreationBox = selectionCount > 0;

  const handleSendMapToMultipleRooms = async (roomIds: string[], mapMessage: any) => {
    const token = readStoredToken();
    if (!token) return;

    let successCount = 0;
    await Promise.all(
        roomIds.map(async (id) => {
            try {
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        roomId: id,
                        type: "map",
                        content: JSON.stringify(mapMessage.getContent())
                    }),
                });

                let data: { ok?: boolean; message?: unknown; error?: string } = {};
                try {
                    data = (await res.json()) as typeof data;
                } catch {
                    /* ignore */
                }

                if (!res.ok) {
                    console.error(`${id} 방 전송 실패`, data.error ?? res.status);
                    return;
                }

                successCount += 1;
                if (data.message) {
                    receiveMessage(id, data.message);
                }
            } catch (e) {
                console.error(`${id} 방 전송 실패`, e);
            }
        })
    );
    loadChatRoomList();
  };

  const handleSendAiToMultipleRooms = async (roomIds: string[], aiMessage: any) => {
    const token = readStoredToken();
    if (!token) return;

    let successCount = 0;
    await Promise.all(
      roomIds.map(async (id) => {
        try {
           const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              roomId: id,
              type: "ai_prompt",
              content: aiMessage.getContent()
            }),
          });

          let data: { ok?: boolean; message?: unknown; error?: string } = {};
          try {
            data = (await res.json()) as typeof data;
          } catch {
            /* ignore */
          }

          if (!res.ok) {
            console.error(`${id} 방 AI 전송 실패`, data.error ?? res.status);
            return;
          }

          successCount++;
          if (data.message) {
            receiveMessage(id, data.message);
          }
        } catch (e) {
          console.error(`${id} 방 AI 전송 실패`, e);
        }
      })
    );
    loadChatRoomList();
  };

  return (
    <div className="flex min-h-screen bg-zinc-100 font-sans dark:bg-black">
      <aside
        className={`absolute sm:relative z-40 flex min-h-screen shrink-0 flex-col border-r border-zinc-200 bg-white transition-all duration-1000 ease-out dark:border-zinc-800 dark:bg-zinc-950 w-72 sm:w-80 shadow-2xl sm:shadow-none ${ sidebarOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0 sm:-ml-80" }`}
        aria-hidden={!sidebarOpen}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 px-5 dark:border-zinc-800 bg-white">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            </div>
            <span className="text-[20px] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500">
              플래시톡
            </span>
          </div>
          <div className="relative group flex items-center">
            <button
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center justify-center w-8 h-8 rounded-full bg-indigo-50 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all duration-[500ms] ease-in-out active:scale-90 shadow-sm border border-indigo-100 overflow-hidden relative ${sidebarOpen ? 'rotate-0 opacity-100 scale-100' : 'rotate-[180deg] opacity-0 scale-50 pointer-events-none'}`}
              aria-label="사이드바 닫기"
            >
              <svg className="absolute w-4 h-4 transition-transform duration-[1000ms] ease-in-out group-hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="absolute top-full mt-2 right-0 px-2.5 py-1.5 bg-zinc-800 text-white text-[11px] font-bold rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              사이드바 닫기
            </div>
          </div>
        </div>
        
        <div className="px-5 pt-5 pb-2">
            <span className="text-[13px] font-extrabold text-zinc-500 tracking-wide">진행 중인 채팅방</span>
        </div>

        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3 custom-scrollbar">
          {roomsLoading && chatRooms.length === 0 && (
            <li className="px-3 py-10 text-center text-sm font-bold text-zinc-400">목록을 불러오는 중...</li>
          )}
          {roomsError && (
            <li className="px-3 py-4 text-center text-sm font-bold text-red-500 bg-red-50 rounded-xl">{roomsError}</li>
          )}
          {!roomsLoading && !roomsError && chatRooms.length === 0 && (
            <li className="px-3 py-10 flex flex-col items-center justify-center gap-3 text-center">
              <span className="text-4xl opacity-50">💬</span>
              <span className="text-sm font-bold text-zinc-400">참여 중인 대화방이 없습니다.</span>
            </li>
          )}
          {chatRooms.map((room) => {
            const leaveUi = roomLeaveUi[room.roomId];
            const listTitle = leaveUi?.partnerUnknown ? "(알 수 없음)" : formatChatRoomListTitle(room.participants);
            const latest = latestMessages[room.roomId];
            const previewText = leaveUi?.sidebarPreview ?? latest?.content ?? "";
            const previewIsPartnerLeft = leaveUi?.partnerUnknown ?? latest?.isPartnerLeft ?? false;
            const unread = unreadCounts[room.roomId] ?? 0;

            return (
              <li key={room.roomId}>
                <button
                  type="button"
                  onClick={() => navigateToChatView(room.roomId)}
                  className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-all hover:bg-zinc-100 hover:scale-[0.98] active:scale-95 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200"
                >
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-indigo-100 to-violet-200 text-[15px] font-black text-indigo-700 shadow-sm border border-white dark:border-zinc-800">
                    {nameInitial(listTitle)}
                    {unread > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white shadow-sm border-2 border-white">
                            {unread > 99 ? "99+" : unread}
                        </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <span className="block truncate text-[14px] font-extrabold text-zinc-900 dark:text-zinc-50">{listTitle}</span>
                    {previewText && (
                      <span className={`block truncate text-[12px] font-medium ${previewIsPartnerLeft ? "text-red-500" : "text-zinc-500"}`}>{previewText}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {sidebarOpen && (
          <div 
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 sm:hidden animate-fade-in" 
              onClick={() => setSidebarOpen(false)}
          />
      )}

      <div className="flex h-screen min-w-0 flex-1 flex-col relative bg-[#fdfdfd]">

        <div className={`flex flex-col h-full overflow-hidden ${(!globalMapOpen && !globalAiOpen) ? 'block' : 'hidden'}`}>
        
        <header className="flex shrink-0 items-center justify-between bg-white h-16 sm:px-6 px-4 border-b border-zinc-200 shadow-sm z-10 w-full relative">
          
          <div className="flex items-center gap-3">
            <div className={`relative group flex items-center transition-all duration-[1000ms] ease-in-out ${sidebarOpen ? 'w-0 opacity-0 scale-50 -rotate-[180deg] pointer-events-none -ml-4' : 'w-10 opacity-100 scale-100 rotate-0'}`}>
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white hover:from-indigo-600 hover:to-violet-600 transition-all duration-[1000ms] active:scale-90 shadow-md shadow-indigo-200 overflow-hidden relative"
                aria-label="사이드바 열기"
              >
                <svg className="absolute w-5 h-5 drop-shadow-sm transition-all duration-[1000ms] ease-in-out transform group-hover:scale-50 group-hover:opacity-0 group-hover:-translate-y-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <svg className="absolute w-5 h-5 drop-shadow-sm transition-all duration-[1000ms] ease-in-out transform translate-y-8 scale-50 opacity-0 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {!sidebarOpen && totalUnreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white shadow-sm border-2 border-white">
                    {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                </span>
              )}

              <div className="absolute top-full mt-2 left-0 px-2.5 py-1.5 bg-zinc-800 text-white text-[11px] font-bold rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                사이드바 메뉴 열기
              </div>
            </div>
            <span className={`text-[22px] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-500 transition-all duration-[1000ms] ease-in-out whitespace-nowrap overflow-hidden ${sidebarOpen ? 'w-0 opacity-0 scale-90 pointer-events-none ml-0' : 'w-auto opacity-100 scale-100'}`}>
              플래시톡
            </span>
          </div>
          <div className="flex items-center gap-4">
            {currentUser && (
              <div className="hidden sm:flex items-center gap-2 border-r border-zinc-200 pr-4 mr-1">
                <span className="bg-zinc-100 text-zinc-600 text-[11px] font-black px-2 py-1 rounded-md tracking-wide">
                  {currentUser.universityName}
                </span>
                <span className="text-sm font-extrabold text-zinc-800">
                  {currentUser.name}
                  <span className="text-xs text-zinc-400 font-mono ml-1 font-medium">({currentUser.studentId})</span>
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setLogoutError(null);
                setLogoutModalOpen(true);
              }}
              disabled={logoutPending}
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-bold text-white transition-all hover:from-indigo-600 hover:to-violet-600 hover:shadow-md disabled:opacity-60 shrink-0"
            >
              로그아웃
            </button>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 overflow-y-auto custom-scrollbar pb-24">
          
          <form
            onSubmit={(e) => {
              e.preventDefault();
              requestSearchUser();
            }}
            className="flex flex-col gap-4 bg-white p-5 rounded-2xl shadow-sm border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800"
          >
            <div className="flex flex-col sm:flex-row items-end gap-3 w-full">
                <label className="flex-1 flex flex-col gap-1.5">
                    <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300 ml-1">
                        학교명
                    </span>
                    <input
                        value={searchUniversityName}
                        onChange={(e) => setSearchUniversityName(e.target.value)}
                        autoComplete="organization"
                        placeholder="ex) 한국대"
                        className={inputClassName}
                    />
                </label>
                <label className="flex-1 flex flex-col gap-1.5">
                    <span className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300 ml-1">
                        학번 또는 이름
                    </span>
                    <input
                        value={searchStudentId}
                        onChange={(e) => setSearchStudentId(e.target.value)}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="ex) 20260001"
                        className={inputClassName}
                    />
                </label>
                <button
                  type="submit"
                  disabled={searchPending}
                  className="h-11 px-7 w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-sm font-bold text-white transition-all active:scale-[0.99] hover:from-indigo-600 hover:to-violet-600 disabled:opacity-60 shadow-md shrink-0"
                >
                  {searchPending ? "사용자 검색 중..." : "사용자 검색"}
                </button>
            </div>
            {searchError && (
              <p className="text-sm text-red-600 font-medium ml-1 mt-1">
                {searchError}
              </p>
            )}
          </form>

          {showCreationBox && (
            <section
              className="flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between dark:border-indigo-900 dark:bg-indigo-950/20 animate-fade-in"
              aria-label="채팅방 만들기"
            >
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
                    {selectionCount}명 선택됨
                  </span>
                  <span className="text-sm font-bold text-indigo-900 dark:text-indigo-300">
                    {chatTypeLabel(selectionCount)} 시작하기
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((user) => (
                    <span
                      key={user.userId}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white border border-indigo-200 py-1.5 pl-3 pr-1.5 text-xs font-bold text-indigo-900 shadow-sm dark:bg-zinc-900 dark:border-indigo-800 dark:text-indigo-200"
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          user.isOnline ? "bg-emerald-500" : "bg-zinc-400"
                        }`}
                        aria-hidden
                      />
                      {user.name}
                      <button
                        type="button"
                        onClick={() => deselectUser(user.userId)}
                        className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" d="M3 3l6 6M9 3L3 9" /></svg>
                      </button>
                    </span>
                  ))}
                </div>
                {createChatError && (
                  <p className="text-sm text-red-600 font-bold">
                    {createChatError}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
                <button
                  type="button"
                  onClick={clearAllSelectedUsers}
                  disabled={selectionCount === 0}
                  className="rounded-xl border border-indigo-200 bg-white px-4 py-3 text-sm font-bold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-50 shadow-sm"
                >
                  선택 취소
                </button>
                <button
                  type="button"
                  onClick={handleStartChat}
                  disabled={selectionCount === 0 || createChatPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition-all active:scale-[0.98] hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-200"
                >
                  <ChatBubbleIcon />
                  {createChatPending ? "생성 중…" : "대화 시작하기"}
                </button>
              </div>
            </section>
          )}

          <section className="flex flex-col bg-white rounded-2xl shadow-sm border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50 dark:bg-zinc-950 dark:border-zinc-800">
                <span className="text-sm font-bold text-zinc-600 dark:text-zinc-400">검색된 사용자 목록</span>
            </div>
            <ul className="flex flex-col">
              {searchPending && visibleUsers.length === 0 && (
                <li className="px-4 py-10 text-center text-sm font-medium text-zinc-500">
                  검색 중...
                </li>
              )}
              {!searchPending && visibleUsers.length === 0 && (
                <li className="px-4 py-10 text-center text-sm font-medium text-zinc-500">
                  학교명과 학번 또는 이름으로 검색해 주세요
                </li>
              )}
              {visibleUsers.map((user) => {
                const isSelected = selectedUsers.some(
                  (u) => u.userId === user.userId
                );
                const canSelect = user.isOnline || isSelected;
                return (
                  <li key={user.userId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => toggleUserSelection(user)}
                      disabled={!canSelect}
                      className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors ${
                        isSelected
                          ? "bg-indigo-50/50 dark:bg-indigo-900/20"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      } ${!canSelect ? "cursor-not-allowed opacity-50 grayscale" : ""}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${isSelected ? "border-indigo-600 bg-indigo-600" : "border-zinc-300 bg-white"}`}>
                        {isSelected && (
                          <svg className="h-4 w-4 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>

                      <span className="relative shrink-0">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-lg font-black text-violet-700 border-2 border-white shadow-sm">
                          {nameInitial(user.name)}
                        </span>
                        {user.isOnline && (
                          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[2.5px] border-white bg-emerald-500 shadow-sm" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-50">
                            {user.name}
                          </span>
                          {user.isOnline && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600 tracking-wide border border-emerald-100">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              ONLINE
                            </span>
                          )}
                        </span>
                        <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          {user.universityName} <span className="mx-1 text-zinc-300">|</span> {user.studentId}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </main>
      </div>

      <div className={globalMapOpen ? 'block' : 'hidden'}>
            <MapSearchView userId={currentUser?.userId ?? ''} chatRooms={chatRooms} onSendToRooms={handleSendMapToMultipleRooms} onClose={() => handleNavigate('home')}/>
        </div>

        <div className={globalAiOpen ? 'block' : 'hidden'}>
            <AiQuestionView userId={currentUser?.userId ?? ''} chatRooms={chatRooms} onSendToRooms={handleSendAiToMultipleRooms} onClose={() => handleNavigate('home')} />
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-[120] flex items-center justify-around bg-white border-t border-zinc-200 h-16 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] pb-safe">
            <button 
                onClick={() => handleNavigate('home')} 
                className={`flex-1 flex flex-col items-center justify-center gap-1.5 transition-colors h-full ${!globalMapOpen && !globalAiOpen ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={!globalMapOpen && !globalAiOpen ? 2.5 : 2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                <span className="text-[10px] font-extrabold tracking-wide">메인 홈</span>
            </button>
            <button 
                onClick={() => handleNavigate('map')} 
                className={`flex-1 flex flex-col items-center justify-center gap-1.5 transition-colors h-full ${globalMapOpen ? 'text-sky-500' : 'text-zinc-400 hover:text-sky-400'}`}
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={globalMapOpen ? 2.5 : 2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                <span className="text-[10px] font-extrabold tracking-wide">지도 검색</span>
            </button>
            <button 
                onClick={() => handleNavigate('ai')} 
                className={`flex-1 flex flex-col items-center justify-center gap-1.5 transition-colors h-full ${globalAiOpen ? 'text-emerald-500' : 'text-zinc-400 hover:text-emerald-400'}`}
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={globalAiOpen ? 2.5 : 2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-[10px] font-extrabold tracking-wide">AI 어시스턴트</span>
            </button>
        </nav>
      </div>

      {inviteToast && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 z-[130] w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-950 animate-slide-up"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm text-zinc-800 dark:text-zinc-200">
            <span className="font-semibold">{inviteToast.inviterName}</span>
            님이 채팅방에 초대했습니다. 이동하시겠습니까?
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setInviteToast(null)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              거절
            </button>
            <button
              type="button"
              onClick={() => {
                const { roomId } = inviteToast;
                setInviteToast(null);
                setPendingInviteEntryRoomId(roomId);
                navigateToChatView(roomId);
              }}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              수락
            </button>
          </div>
        </div>
      )}

      {logoutModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg dark:bg-zinc-950">
            <h2
              id="logout-dialog-title"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              로그아웃 하시겠습니까?
            </h2>
            {logoutError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {logoutError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!logoutPending) {
                    setLogoutError(null);
                    setLogoutModalOpen(false);
                  }
                }}
                disabled={logoutPending}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => void confirmLogout()}
                disabled={logoutPending}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
              >
                {logoutPending ? "Logging out…" : "Yes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
