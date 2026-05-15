"use client";

import { CLIENT_SESSION_ID_KEY } from "@/lib/session";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MainView() {
  const router = useRouter();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

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
