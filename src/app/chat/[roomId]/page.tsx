"use client";

import type { ParticipantsDTO } from "@/entities/Participants";
import type { SessionUserDTO } from "@/entities/User";
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

function formatTodayDateLabel(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function formatParticipantHeaderTitle(participants: ParticipantsDTO[]): string {
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

function nameInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0) : "?";
}

function readStoredToken(): string | null {
  try {
    const token = sessionStorage.getItem(CLIENT_JWT_KEY);
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export default function ChatView({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const router = useRouter();
  const [participants, setParticipants] = useState<ParticipantsDTO[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantsError, setParticipantsError] = useState<string | null>(
    null
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<SessionUserDTO | null>(null);

  const totalParticipantCount = participants.length + 1;

  const headerTitle = formatParticipantHeaderTitle(participants);
  const headerSubtitle =
    participants.length === 1 ? participants[0].studentId : null;

  useEffect(() => {
    const user = readStoredUser();
    if (user) setCurrentUser(user);
  }, []);

  useEffect(() => {
    const token = readStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    setParticipantsLoading(true);
    setParticipantsError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/chat?roomId=${encodeURIComponent(roomId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        let data: {
          ok?: boolean;
          participants?: ParticipantsDTO[];
          error?: string;
        } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          /* ignore */
        }

        if (cancelled) return;

        if (!res.ok || !data.ok || !Array.isArray(data.participants)) {
          setParticipantsError(
            typeof data.error === "string"
              ? data.error
              : "채팅방 정보를 불러오지 못했습니다."
          );
          setParticipants([]);
          return;
        }

        setParticipants(data.participants);
      } catch {
        if (!cancelled) {
          setParticipantsError("네트워크 오류가 발생했습니다.");
          setParticipants([]);
        }
      } finally {
        if (!cancelled) setParticipantsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, router]);

  return (
    <div className="relative flex h-screen flex-col bg-[#fdfdfd] font-sans">
      {settingsOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40"
          aria-label="대화방 설정 닫기"
          onClick={() => setSettingsOpen(false)}
        />
      )}

      <div
        className={`flex min-h-0 flex-1 flex-col transition-[filter] ${
          settingsOpen ? "pointer-events-none brightness-[0.65]" : ""
        }`}
      >
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-6">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-bold text-black">
              {participantsLoading ? "불러오는 중…" : headerTitle}
            </span>
            {participantsError ? (
              <span className="text-xs text-red-500">{participantsError}</span>
            ) : headerSubtitle ? (
              <span className="text-xs text-zinc-500">{headerSubtitle}</span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="text-zinc-600 hover:text-black"
            aria-label="대화방 설정 열기"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </header>

        {/* Body */}
        <main className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#f8f9fa] p-4">
        {/* Date separator */}
        <div className="flex justify-center my-4">
          <span className="rounded-full bg-white px-4 py-1.5 text-xs text-zinc-500 shadow-sm">
            {formatTodayDateLabel()}
          </span>
        </div>

        {/* My message */}
        <div className="flex flex-col items-end gap-1">
          <div className="rounded-2xl rounded-tr-none px-4 py-2.5 text-sm text-white" style={{ backgroundColor: '#d070fb' }}>
            안녕하세요! 방금 메인 화면에서 보고 대화 걸었습니다.
          </div>
          <span className="text-[11px] text-zinc-400">오후 3:58</span>
        </div>

        {/* Other's message (Text) */}
        <div className="flex flex-col items-start gap-1 mt-2">
          <span className="text-xs font-medium text-zinc-600 ml-1">김지훈</span>
          <div className="flex items-end gap-2">
            <div className="rounded-2xl rounded-tl-none bg-white px-4 py-2.5 text-sm text-zinc-800 shadow-sm">
              아, 네! 반갑습니다. 요청하신 자료는 파일로 보내드릴게요.
            </div>
            <span className="text-[11px] text-zinc-400">오후 4:00</span>
          </div>
        </div>

        {/* Other's message (File) */}
        <div className="flex flex-col items-start gap-1 mt-2">
          <span className="text-xs font-medium text-zinc-600 ml-1">김지훈</span>
          <div className="flex items-end gap-2">
            <div className="rounded-2xl rounded-tl-none bg-white p-4 shadow-sm min-w-[200px]">
              <div className="flex items-center gap-2 mb-3">
                <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="text-sm font-medium text-zinc-800">프로젝트_보안_설계도.pdf</span>
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>2.4MB</span>
                <button type="button" className="flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 hover:bg-zinc-200">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>저장</span>
                </button>
              </div>
            </div>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1">오후 4:03</span>
        </div>
        </main>

        {/* Footer */}
        <footer className="flex shrink-0 items-center gap-3 bg-white p-4">
        <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center text-zinc-500 hover:text-black">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="flex flex-1 items-center rounded-xl bg-zinc-100 px-4 py-2.5">
          <input
            type="text"
            placeholder="네, 확인했습니다."
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
          />
        </div>
        <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black text-white hover:bg-zinc-800">
          <svg className="h-4 w-4 translate-x-[-1px] translate-y-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
        </footer>
      </div>

      {/* Chat room settings panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl transition-transform duration-200 ease-out ${
          settingsOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!settingsOpen}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-100 px-5">
          <h2 className="text-lg font-bold text-zinc-900">대화방 설정</h2>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="닫기"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-800">
            <svg
              className="h-5 w-5 text-zinc-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span>
              현재 대화 참여자 ({totalParticipantCount}명)
            </span>
          </div>

          <ul className="flex flex-col gap-3">
            <li className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-sm font-semibold text-white">
                {currentUser ? nameInitial(currentUser.name) : "나"}
              </span>
              <span className="text-sm font-medium text-zinc-900">나</span>
            </li>
            {participants.map((p) => (
              <li key={p.studentId} className="flex items-center gap-3">
                <span className="relative shrink-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-200 text-sm font-semibold text-violet-800">
                    {nameInitial(p.name)}
                  </span>
                  <span
                    className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
                    aria-hidden
                  />
                </span>
                <span className="text-sm text-zinc-800">
                  {p.name}{" "}
                  <span className="text-zinc-500">({p.studentId})</span>
                </span>
              </li>
            ))}
            {participantsLoading && participants.length === 0 && (
              <li className="text-sm text-zinc-500">불러오는 중…</li>
            )}
          </ul>

          <div className="my-6 border-t border-zinc-100" />

          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
            새로운 사용자 초대하기
          </button>

          <button
            type="button"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            대화방 나가기
          </button>
        </div>
      </aside>
    </div>
  );
}
