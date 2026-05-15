"use client";

import type { UserSearchResultDTO } from "@/entities/User";
import { CLIENT_SESSION_ID_KEY } from "@/lib/session";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClassName =
  "h-11 w-full rounded-md border border-zinc-200 bg-white px-4 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50";

export default function MainView() {
  const router = useRouter();
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
          credentials: "include",
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
          setSearchError(
            data.error ?? "해당 사용자가 없습니다."
          );
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
    try {
      const res = await fetch("/api/users/logout", {
        method: "POST",
        credentials: "include",
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

      try {
        sessionStorage.removeItem(CLIENT_SESSION_ID_KEY);
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
