"use client";

import type { SessionUserDTO, UserSearchResultDTO } from "@/entities/User";
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const PRESENCE_HEARTBEAT_MS = 60 * 1000;
const USER_PRESENCE_CHANNEL = "user_presence_channel";

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
  const channelRef = useRef<RealtimeChannel | null>(null);

  const [currentUser, setCurrentUser] = useState<SessionUserDTO | null>(null);

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const [searchStudentId, setSearchStudentId] = useState("");
  const [searchUniversityName, setSearchUniversityName] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<UserSearchResultDTO[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const [createChatPending, setCreateChatPending] = useState(false);
  const [createChatError, setCreateChatError] = useState<string | null>(null);

  const selectedUsers = useMemo(
    () =>
      selectedUserIds
        .map((id) => searchResults.find((u) => u.userId === id))
        .filter((u): u is UserSearchResultDTO => u != null),
    [selectedUserIds, searchResults]
  );

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
      await supabase.realtime.setAuth(token);
      if (cancelled) return;

      const channel = supabase.channel(USER_PRESENCE_CHANNEL);
      channelRef.current = channel;

      channel.on(
        "broadcast",
        { event: "INVITE_TO_ROOM" },
        (payload) => {
          console.info("[INVITE_TO_ROOM]", payload);
        }
      );

      channel.subscribe(async (status) => {
        if (cancelled || status !== "SUBSCRIBED") return;
        await channel.track({ isOnline: true, userId: user.userId });
      });

      heartbeatId = window.setInterval(() => {
        void postPresenceHeartbeat(token);
      }, PRESENCE_HEARTBEAT_MS);
    })();

    return () => {
      cancelled = true;
      if (heartbeatId !== undefined) window.clearInterval(heartbeatId);
      const ch = channelRef.current;
      if (ch) {
        void ch.untrack();
        void supabase.removeChannel(ch);
        channelRef.current = null;
      }
    };
  }, [router]);

  function toggleUserSelection(user: UserSearchResultDTO): void {
    setCreateChatError(null);
    setSelectedUserIds((prev) => {
      if (prev.includes(user.userId)) {
        return prev.filter((id) => id !== user.userId);
      }
      if (!user.isOnline) return prev;
      return [...prev, user.userId];
    });
  }

  function deselectLastUser(): void {
    setCreateChatError(null);
    setSelectedUserIds((prev) => prev.slice(0, -1));
  }

  function mergeSearchResult(result: UserSearchResultDTO): void {
    setSearchResults((prev) => {
      const index = prev.findIndex((u) => u.userId === result.userId);
      if (index === -1) return [...prev, result];
      const next = [...prev];
      next[index] = result;
      return next;
    });
  }

  function requestSearchUser(): void {
    setSearchError(null);
    setCreateChatError(null);

    const studentId = searchStudentId.trim();
    const universityName = searchUniversityName.trim();

    if (!studentId) {
      setSearchError("학번을 입력해 주세요.");
      return;
    }
    if (!universityName) {
      setSearchError("학교 이름을 입력해 주세요.");
      return;
    }

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

        mergeSearchResult(data.result);
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
    if (selectedUserIds.length === 0 || createChatPending) return;
    setCreateChatError(null);
    setCreateChatPending(true);
    void (async () => {
      try {
        const roomId = await requestCreateChatRoom(selectedUserIds);
        if (roomId) navigateToChatView(roomId);
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

    try {
      const headers: HeadersInit = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/users/logout", {
        method: "POST",
        headers,
      });

      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as { ok?: boolean; error?: string };
      } catch {
        /* ignore */
      }

      if (!res.ok || !data.ok) {
        setLogoutError(
          typeof data.error === "string"
            ? data.error
            : "로그아웃에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
        return;
      }

      const ch = channelRef.current;
      if (ch) {
        ch.untrack();
        getBrowserSupabaseClient().removeChannel(ch);
        channelRef.current = null;
      }

      try {
        sessionStorage.removeItem(CLIENT_JWT_KEY);
        sessionStorage.removeItem(CLIENT_USER_KEY);
      } catch {
        /* ignore */
      }

      setLogoutModalOpen(false);
      router.push("/login");
    } catch {
      setLogoutError("네트워크 오류가 발생했습니다.");
    } finally {
      setLogoutPending(false);
    }
  }

  const selectionCount = selectedUserIds.length;
  const showCreationBox = selectionCount > 0;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 font-sans dark:bg-black">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <span className="text-xl font-bold tracking-tight text-black dark:text-zinc-50">
          플래시톡
        </span>
        <button
          type="button"
          onClick={() => {
            setLogoutError(null);
            setLogoutModalOpen(true);
          }}
          disabled={logoutPending}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          로그아웃
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            requestSearchUser();
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              학교
            </span>
            <input
              value={searchUniversityName}
              onChange={(e) => setSearchUniversityName(e.target.value)}
              autoComplete="organization"
              placeholder="ex) 한국대"
              className={inputClassName}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              학번
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
          {searchError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {searchError}
            </p>
          )}
          <button
            type="submit"
            disabled={searchPending}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {searchPending ? "검색 중…" : "검색"}
          </button>
        </form>

        {showCreationBox && (
          <section
            className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800 dark:bg-zinc-950"
            aria-label="채팅방 만들기"
          >
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {selectionCount}명 선택됨
                </span>
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {chatTypeLabel(selectionCount)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map((user) => (
                  <span
                    key={user.userId}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        user.isOnline ? "bg-emerald-400" : "bg-zinc-400"
                      }`}
                      aria-hidden
                    />
                    {user.name}
                  </span>
                ))}
              </div>
              {createChatError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {createChatError}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
              <button
                type="button"
                onClick={deselectLastUser}
                disabled={selectionCount === 0}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
              >
                선택 취소
              </button>
              <button
                type="button"
                onClick={handleStartChat}
                disabled={selectionCount === 0 || createChatPending}
                className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <ChatBubbleIcon />
                {createChatPending ? "생성 중…" : "Start Chat"}
              </button>
            </div>
          </section>
        )}

        <section className="flex min-h-0 flex-1 flex-col">
          <ul className="flex flex-col gap-2 overflow-y-auto">
            {searchPending && visibleUsers.length === 0 && (
              <li className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:bg-zinc-950">
                검색 중…
              </li>
            )}
            {!searchPending && visibleUsers.length === 0 && (
              <li className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:bg-zinc-950">
                학번과 학교명으로 검색해 주세요.
              </li>
            )}
            {visibleUsers.map((user) => {
              const isSelected = selectedUserIds.includes(user.userId);
              const canSelect = user.isOnline || isSelected;
              return (
                <li key={user.userId}>
                  <button
                    type="button"
                    onClick={() => toggleUserSelection(user)}
                    disabled={!canSelect}
                    aria-disabled={!canSelect}
                    className={`flex w-full items-center gap-3 rounded-2xl border-2 bg-white px-4 py-3 text-left transition-colors dark:bg-zinc-950 ${
                      isSelected
                        ? "border-sky-400 bg-sky-50/80 dark:border-sky-500 dark:bg-sky-950/30"
                        : "border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
                    } ${!canSelect ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                        isSelected
                          ? "border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100"
                          : "border-zinc-300 bg-white dark:border-zinc-600"
                      }`}
                      aria-hidden
                    >
                      {isSelected && (
                        <svg
                          className="h-3 w-3 text-white dark:text-zinc-900"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            d="M2 6l3 3 5-5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>

                    <span className="relative shrink-0">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-200 text-base font-semibold text-violet-800 dark:bg-violet-900 dark:text-violet-200">
                        {nameInitial(user.name)}
                      </span>
                      {user.isOnline && (
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-zinc-950" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {user.name}
                        </span>
                        {user.isOnline && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            온라인
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm text-zinc-500 dark:text-zinc-400">
                        {user.studentId} | {user.universityName} | {user.isOnline}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </main>

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
