"use client";

import type { SessionUserDTO, UserSearchResultDTO } from "@/entities/User";
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PRESENCE_HEARTBEAT_MS = 60 * 1000;
const USER_PRESENCE_CHANNEL = "user_presence_channel";

const inputClassName =
  "h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50";

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

async function postPresence(
  token: string,
  body: { isOnline: boolean } | { heartbeat: true }
): Promise<boolean> {
  const res = await fetch("/api/presence", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export default function MainView() {
  const router = useRouter();
  const channelRef = useRef<RealtimeChannel | null>(null);

  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const [searchUniversityName, setSearchUniversityName] = useState("");
  const [searchStudentId, setSearchStudentId] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchedUser, setSearchedUser] = useState<UserSearchResultDTO | null>(
    null
  );

  useEffect(() => {
    const token = readStoredToken();
    const user = readStoredUser();
    if (!token || !user) {
      router.replace("/login");
      return;
    }

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

        await postPresence(token, { isOnline: true });
        await channel.track({ isOnline: true, userId: user.userId });
      });

      heartbeatId = window.setInterval(() => {
        void postPresence(token, { heartbeat: true });
      }, PRESENCE_HEARTBEAT_MS);
    })();

    return () => {
      cancelled = true;
      if (heartbeatId !== undefined) {
        window.clearInterval(heartbeatId);
      }
      const ch = channelRef.current;
      if (ch) {
        void ch.untrack();
        void supabase.removeChannel(ch);
        channelRef.current = null;
      }
    };
  }, [router]);

  function displaySearchedUser(userSearchResult: UserSearchResultDTO): void {
    setSearchedUser(userSearchResult);
  }

  function requestSearchUser(): void {
    setSearchError(null);
    setSearchedUser(null);

    const uni = searchUniversityName.trim();
    const sid = searchStudentId.trim();

    if (!uni) {
      setSearchError("학교 이름을 입력해 주세요.");
      return;
    }
    if (!sid) {
      setSearchError("학번을 입력해 주세요.");
      return;
    }

    setSearchPending(true);
    void (async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            universityName: uni,
            studentId: sid,
          }),
        });

        let data: {
          ok?: boolean;
          result?: UserSearchResultDTO;
          error?: string;
        } = {};
        try {
          data = (await res.json()) as {
            ok?: boolean;
            result?: UserSearchResultDTO;
            error?: string;
          };
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

        displaySearchedUser(data.result);
      } catch {
        setSearchError("네트워크 오류가 발생했습니다.");
      } finally {
        setSearchPending(false);
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
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

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
        await ch.untrack();
        await getBrowserSupabaseClient().removeChannel(ch);
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

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-black">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <span className="text-xl font-bold tracking-tight text-black dark:text-zinc-50">
            플래시톡
          </span>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              requestSearchUser();
            }}
            className="flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
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
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
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
              className="flex h-11 w-full items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
            >
              {searchPending ? "검색 중…" : "검색"}
            </button>

            {searchedUser && (
              <div
                className="mt-1 flex flex-wrap items-center gap-x-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
                aria-live="polite"
              >
                <span>{searchedUser.studentId}</span>
                <span className="text-zinc-400 dark:text-zinc-500">/</span>
                <span>{searchedUser.universityName}</span>
                <span className="text-zinc-400 dark:text-zinc-500">/</span>
                <span>{searchedUser.name}</span>
                <span className="text-zinc-400 dark:text-zinc-500">/</span>
                <span>
                  {searchedUser.isOnline ? "온라인" : "오프라인"}
                </span>
              </div>
            )}
          </form>
        </div>

        <button
          type="button"
          onClick={() => {
            setLogoutError(null);
            setLogoutModalOpen(true);
          }}
          disabled={logoutPending}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          로그아웃
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-6">
        {/* 메인 콘텐츠 영역 */}
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
