"use client";

import type { ParticipantsDTO } from "@/entities/Participants";
import type { SessionUserDTO } from "@/entities/User";
import { readRoomMessages } from "@/lib/chat-room-messages-storage";
import type { ChatMessagePayload } from "@/lib/message-payload";
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import { useGlobalSocket } from "@/store/GlobalSocketProvider";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

function formatTodayDateLabel(): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function formatMessageTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
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

function resolveSenderName(
  senderId: string,
  currentUser: SessionUserDTO | null,
  participants: ParticipantsDTO[]
): string {
  if (currentUser && senderId === currentUser.userId) {
    return currentUser.name?.trim() || "나";
  }
  const participant = participants.find((p) => p.userId === senderId);
  if (participant) return participant.name;
  return "알 수 없음";
}

function mergeMessages(
  stored: ChatMessagePayload[],
  live: ChatMessagePayload[]
): ChatMessagePayload[] {
  const byId = new Map<string, ChatMessagePayload>();
  for (const m of [...stored, ...live]) {
    byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}

export default function ChatView({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const router = useRouter();
  const { roomMessages, getRoomMessages, ensureRoomChannel, receiveMessage } =
    useGlobalSocket();

  const [participants, setParticipants] = useState<ParticipantsDTO[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantsError, setParticipantsError] = useState<string | null>(
    null
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<SessionUserDTO | null>(null);

  const [transientMessageList, setTransientMessageList] = useState<
    ChatMessagePayload[]
  >([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const totalParticipantCount = participants.length + 1;

  const headerTitle = formatParticipantHeaderTitle(participants);
  const headerSubtitle =
    participants.length === 1 ? participants[0].studentId : null;

  const requestSendMessage = useCallback(async (): Promise<void> => {
    const trimmed = currentMessage.trim();
    if (!trimmed || isLoading) return;

    const token = readStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setIsLoading(true);
    setSendError(null);
    setCurrentMessage("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roomId,
          type: "text",
          content: trimmed,
        }),
      });

      let data: { ok?: boolean; message?: ChatMessagePayload; error?: string } =
        {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }

      if (!res.ok) {
        setSendError(
          typeof data.error === "string"
            ? data.error
            : "메시지 전송에 실패했습니다."
        );
        setCurrentMessage(trimmed);
        return;
      }

      if (data.message) {
        receiveMessage(roomId, data.message);
      }
    } catch {
      setSendError("네트워크 오류가 발생했습니다.");
      setCurrentMessage(trimmed);
    } finally {
      setIsLoading(false);
    }
  }, [currentMessage, isLoading, roomId, router, receiveMessage]);

  useEffect(() => {
    const user = readStoredUser();
    if (user) setCurrentUser(user);
  }, []);

  useEffect(() => {
    void ensureRoomChannel(roomId);
  }, [roomId, ensureRoomChannel]);

  useEffect(() => {
    const stored = readRoomMessages(roomId);
    const live = getRoomMessages(roomId);
    setTransientMessageList(mergeMessages(stored, live));
  }, [roomId, roomMessages, getRoomMessages]);

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

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    void requestSendMessage();
  }

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
          <div className="my-4 flex justify-center">
            <span className="rounded-full bg-white px-4 py-1.5 text-xs text-zinc-500 shadow-sm">
              {formatTodayDateLabel()}
            </span>
          </div>

          {transientMessageList.map((msg) => {
            if (msg.type !== "text") return null;

            const isMine =
              currentUser != null && msg.senderId === currentUser.userId;
            const senderName = resolveSenderName(
              msg.senderId,
              currentUser,
              participants
            );
            const timeLabel = formatMessageTime(msg.createdAt);

            if (isMine) {
              return (
                <div key={msg.id} className="flex flex-col items-end gap-1">
                  <div
                    className="rounded-2xl rounded-tr-none px-4 py-2.5 text-sm text-white"
                    style={{ backgroundColor: "#d070fb" }}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[11px] text-zinc-400">{timeLabel}</span>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className="mt-2 flex flex-col items-start gap-1"
              >
                <span className="ml-1 text-xs font-medium text-zinc-600">
                  {senderName}
                </span>
                <div className="flex items-end gap-2">
                  <div className="rounded-2xl rounded-tl-none bg-white px-4 py-2.5 text-sm text-zinc-800 shadow-sm">
                    {msg.content}
                  </div>
                  <span className="text-[11px] text-zinc-400">{timeLabel}</span>
                </div>
              </div>
            );
          })}
        </main>

        {/* Footer */}
        <footer className="flex shrink-0 flex-col gap-1 bg-white p-4">
          {sendError && (
            <p className="text-center text-xs text-red-500">{sendError}</p>
          )}
          <form
            className="flex items-center gap-3"
            onSubmit={handleSubmit}
          >
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center text-zinc-500 hover:text-black"
              disabled={isLoading}
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            <div className="flex flex-1 items-center rounded-xl bg-zinc-100 px-4 py-2.5">
              <input
                type="text"
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                placeholder="메시지를 입력하세요"
                disabled={isLoading}
                className="w-full bg-transparent text-sm text-black outline-none placeholder:text-zinc-500 disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !currentMessage.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              <svg
                className="h-4 w-4 translate-x-[-1px] translate-y-[1px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </form>
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
            <span>현재 대화 참여자 ({totalParticipantCount}명)</span>
          </div>

          <ul className="flex flex-col gap-3">
            <li className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-sm font-semibold text-white">
                {currentUser ? nameInitial(currentUser.name) : "나"}
              </span>
              <span className="text-sm font-medium text-zinc-900">나</span>
            </li>
            {participants.map((p) => (
              <li key={p.userId} className="flex items-center gap-3">
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
            친구 초대하기
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
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Leave Room
          </button>
        </div>
      </aside>
    </div>
  );
}
