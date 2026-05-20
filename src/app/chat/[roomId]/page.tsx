"use client";

import {
  INVITE_TO_ROOM_EVENT,
  type InviteToRoomPayload,
  userPresenceChannelName,
} from "@/lib/presence-channel";
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef } from "react";

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
    <div>
      <h1>ChatView</h1>
      <p>Room ID: {roomId}</p>
    </div>
  );
}
