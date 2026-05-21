"use client";

import type { ParticipantsDTO } from "@/entities/Participants";
import {
  INVITE_TO_ROOM_EVENT,
  type InviteToRoomPayload,
  userPresenceChannelName,
} from "@/lib/presence-channel";
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";

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

function readStoredUserId(): string | null {
  try {
    const raw = sessionStorage.getItem(CLIENT_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const userId = (parsed as Record<string, unknown>).userId;
    return typeof userId === "string" && userId.length > 0 ? userId : null;
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

export default function ChatView({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const router = useRouter();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [participants, setParticipants] = useState<ParticipantsDTO[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(true);
  const [participantsError, setParticipantsError] = useState<string | null>(
    null
  );

  const headerTitle = formatParticipantHeaderTitle(participants);
  const headerSubtitle =
    participants.length === 1 ? participants[0].studentId : null;

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

  useEffect(() => {
    const token = readStoredToken();
    const userId = readStoredUserId();
    if (!token || !userId) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    const supabase = getBrowserSupabaseClient();

    void (async () => {
      await supabase.realtime.setAuth(token);
      if (cancelled) return;

      const channel = supabase.channel(userPresenceChannelName(userId));
      channelRef.current = channel;

      channel.on(
        "broadcast",
        { event: INVITE_TO_ROOM_EVENT },
        ({ payload }) => {
          const invite = payload as InviteToRoomPayload;
          if (typeof invite?.roomId === "string") {
            router.push(`/chat/${invite.roomId}`);
          }
        }
      );

      channel.subscribe();
    })();

    return () => {
      cancelled = true;
      const ch = channelRef.current;
      if (ch) {
        void supabase.removeChannel(ch);
        channelRef.current = null;
      }
    };
  }, [router]);

  return (
    <div className="flex h-screen flex-col bg-[#fdfdfd] font-sans">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-6">
        <div className="flex flex-col min-w-0">
          <span className="truncate text-lg font-bold text-black">
            {participantsLoading ? "불러오는 중…" : headerTitle}
          </span>
          {participantsError ? (
            <span className="text-xs text-red-500">{participantsError}</span>
          ) : headerSubtitle ? (
            <span className="text-xs text-zinc-500">{headerSubtitle}</span>
          ) : null}
        </div>
        <button type="button" className="text-zinc-600 hover:text-black">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto bg-[#f8f9fa] p-4 flex flex-col gap-4">
        {/* Date separator */}
        <div className="flex justify-center my-4">
          <span className="rounded-full bg-white px-4 py-1.5 text-xs text-zinc-500 shadow-sm">
            2026년 4월 19일 일요일
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
      <footer className="shrink-0 bg-white p-4 flex items-center gap-3">
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
  );
}
