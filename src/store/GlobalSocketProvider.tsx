"use client";

import type { ChatRoomListItemDTO } from "@/entities/ChatRoomListItem";
import type { SessionUserDTO } from "@/entities/User";
import {
  CHAT_MESSAGE_EVENT,
  createChatRoomChannel,
} from "@/lib/chat-room-channel";
import {
  appendRoomMessage,
  clearRoomMessages,
} from "@/lib/chat-room-messages-storage";
import type { ChatMessagePayload } from "@/lib/message-payload";
import {
  isChatMessagePayload,
  isSystemMessagePayload,
  unwrapBroadcastPayload,
} from "@/lib/message-payload";
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SUBSCRIBE_TIMEOUT_MS = 10_000;

function readPageVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

export type LatestMessagePreview = {
  roomId: string;
  content: string;
  createdAt: string;
  senderId: string;
  isSystemNotice?: boolean;
  isPartnerLeft?: boolean;
};

/** UI state after USER_LEFT (1:1 disable vs group notice). */
export type RoomLeaveUiState = {
  chatDisabled: boolean;
  partnerUnknown: boolean;
  sidebarPreview: string;
};

type GlobalSocketContextValue = {
  roomMessages: Record<string, ChatMessagePayload[]>;
  latestMessages: Record<string, LatestMessagePreview>;
  unreadCounts: Record<string, number>;
  roomLeaveUi: Record<string, RoomLeaveUiState>;
  activeRoomId: string | null;
  refreshRooms: () => void;
  ensureRoomChannel: (roomId: string) => Promise<void>;
  receiveMessage: (roomId: string, raw: unknown) => void;
  getRoomMessages: (roomId: string) => ChatMessagePayload[];
  /** Procedure step 10: unsubscribe, clear history, remove store data. */
  leaveRoomAndCleanup: (roomId: string) => Promise<void>;
  /** Logout step 3: release all Realtime channels and reset in-memory state. */
  disconnectAllSockets: () => Promise<void>;
  /** Procedure 9.1: invitee accepted toast and navigates to chat. */
  setPendingInviteEntryRoomId: (roomId: string | null) => void;
  /** Procedure 9.2–9.5: read once and clear the pending invite entry flag. */
  consumePendingInviteEntry: () => string | null;
};

const GlobalSocketContext = createContext<GlobalSocketContextValue | null>(
  null
);

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

function toLatestPreview(
  roomId: string,
  message: ChatMessagePayload
): LatestMessagePreview {
  if (message.type === "system") {
    const partnerLeft =
      message.actionType === "USER_LEFT" &&
      message.remainingCount === 1;
    return {
      roomId,
      content: message.content ?? "",
      createdAt: message.createdAt,
      senderId: message.senderId,
      isSystemNotice: true,
      isPartnerLeft: partnerLeft,
    };
  }

  return {
    roomId,
    content:
      message.type === "text"
        ? (message.content ?? "")
        : (message.fileName ?? "파일"),
    createdAt: message.createdAt,
    senderId: message.senderId,
  };
}

export function useGlobalSocket(): GlobalSocketContextValue {
  const ctx = useContext(GlobalSocketContext);
  if (!ctx) {
    throw new Error("useGlobalSocket must be used within GlobalSocketProvider");
  }
  return ctx;
}

export function GlobalSocketProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const activeRoomId = useMemo(() => {
    const match = pathname?.match(/^\/chat\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const [roomMessages, setRoomMessages] = useState<
    Record<string, ChatMessagePayload[]>
  >({});
  const [latestMessages, setLatestMessages] = useState<
    Record<string, LatestMessagePreview>
  >({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [roomLeaveUi, setRoomLeaveUi] = useState<
    Record<string, RoomLeaveUiState>
  >({});

  const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const subscribedRoomIdsRef = useRef<string[]>([]);
  const subscribingRef = useRef<Map<string, Promise<void>>>(new Map());
  const currentUserIdRef = useRef<string | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const pageVisibleRef = useRef(readPageVisible());
  const pendingInviteEntryRoomIdRef = useRef<string | null>(null);

  activeRoomIdRef.current = activeRoomId;

  const setPendingInviteEntryRoomId = useCallback((roomId: string | null) => {
    pendingInviteEntryRoomIdRef.current = roomId?.trim() || null;
  }, []);

  const consumePendingInviteEntry = useCallback((): string | null => {
    const roomId = pendingInviteEntryRoomIdRef.current;
    pendingInviteEntryRoomIdRef.current = null;
    return roomId;
  }, []);

  const ingestMessage = useCallback((roomId: string, raw: unknown) => {
    const unwrapped = unwrapBroadcastPayload(raw);
    if (!isChatMessagePayload(unwrapped)) return;

    const message: ChatMessagePayload = {
      ...unwrapped,
      roomId: unwrapped.roomId ?? roomId,
    };
    const normalizedRoomId = (message.roomId ?? roomId).trim();

    appendRoomMessage(normalizedRoomId, message);

    setRoomMessages((prev) => {
      const list = prev[normalizedRoomId] ?? [];
      if (list.some((m) => m.id === message.id)) return prev;
      return {
        ...prev,
        [normalizedRoomId]: [...list, message],
      };
    });

    setLatestMessages((prev) => ({
      ...prev,
      [normalizedRoomId]: toLatestPreview(normalizedRoomId, message),
    }));

    const myUserId = currentUserIdRef.current;
    const isViewingRoom = activeRoomIdRef.current === normalizedRoomId;
    const isOwnMessage = myUserId != null && message.senderId === myUserId;

    if (!isViewingRoom && !isOwnMessage) {
      setUnreadCounts((prev) => ({
        ...prev,
        [normalizedRoomId]: (prev[normalizedRoomId] ?? 0) + 1,
      }));
    }
  }, []);

  const receiveMessage = useCallback(
    (roomId: string, raw: unknown) => {
      ingestMessage(roomId, raw);
    },
    [ingestMessage]
  );

  const resetGlobalState = useCallback(() => {
    currentUserIdRef.current = null;
    setRoomMessages({});
    setLatestMessages({});
    setUnreadCounts({});
    setRoomLeaveUi({});
  }, []);

  const applyUserLeftUiState = useCallback(
    (normalizedRoomId: string, message: ChatMessagePayload) => {
      if (message.type !== "system" || message.actionType !== "USER_LEFT") {
        return;
      }

      const preview = message.content ?? "";
      const oneOnOneLeft = message.remainingCount === 1;

      setRoomLeaveUi((prev) => ({
        ...prev,
        [normalizedRoomId]: {
          chatDisabled: oneOnOneLeft,
          partnerUnknown: oneOnOneLeft,
          sidebarPreview: preview,
        },
      }));
    },
    []
  );

  const ingestSystemMessage = useCallback(
    (roomId: string, raw: unknown) => {
      const unwrapped = unwrapBroadcastPayload(raw);
      if (!isSystemMessagePayload(unwrapped)) return;

      const message: ChatMessagePayload = {
        ...unwrapped,
        roomId: unwrapped.roomId ?? roomId,
      };
      const normalizedRoomId = (message.roomId ?? roomId).trim();

      appendRoomMessage(normalizedRoomId, message);

      setRoomMessages((prev) => {
        const list = prev[normalizedRoomId] ?? [];
        if (list.some((m) => m.id === message.id)) return prev;
        return {
          ...prev,
          [normalizedRoomId]: [...list, message],
        };
      });

      setLatestMessages((prev) => ({
        ...prev,
        [normalizedRoomId]: toLatestPreview(normalizedRoomId, message),
      }));

      applyUserLeftUiState(normalizedRoomId, message);
    },
    [applyUserLeftUiState]
  );

  const teardownChannels = useCallback(async () => {
    const supabase = getBrowserSupabaseClient();
    const channels = channelsRef.current;
    await Promise.all(
      [...channels.values()].map((ch) => supabase.removeChannel(ch))
    );
    channels.clear();
    subscribingRef.current.clear();
    subscribedRoomIdsRef.current = [];
  }, []);

  /** Procedure step 3: bulk-unsubscribe chat + presence channels via Supabase. */
  const disconnectAllSockets = useCallback(async () => {
    const supabase = getBrowserSupabaseClient();
    const tracked = channelsRef.current;
    await Promise.all(
      [...tracked.values()].map((ch) => {
        try {
          ch.untrack();
        } catch {
          /* presence channel may not be tracking */
        }
      })
    );
    await supabase.removeAllChannels();
    channelsRef.current.clear();
    subscribingRef.current.clear();
    subscribedRoomIdsRef.current = [];
    resetGlobalState();
  }, [resetGlobalState]);

  const subscribeToRoom = useCallback(
    async (roomId: string): Promise<void> => {
      const normalizedId = roomId.trim();
      if (!normalizedId || !readStoredToken()) return;

      if (!pageVisibleRef.current) return;

      if (channelsRef.current.has(normalizedId)) return;

      const pending = subscribingRef.current.get(normalizedId);
      if (pending) {
        await pending;
        return;
      }

      const supabase = getBrowserSupabaseClient();
      const task = (async () => {
        const channel = createChatRoomChannel(supabase, normalizedId);
        channel.on(
          "broadcast",
          { event: CHAT_MESSAGE_EVENT },
          ({ payload }) => {
            const unwrapped = unwrapBroadcastPayload(payload);
            if (isSystemMessagePayload(unwrapped)) {
              ingestSystemMessage(normalizedId, unwrapped);
              return;
            }
            ingestMessage(normalizedId, payload);
          }
        );

        let subscribedOk = false;

        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            if (!pageVisibleRef.current) {
              resolve();
              return;
            }
            reject(
              new Error(
                `[GlobalSocketProvider] subscribe timeout: ${normalizedId}`
              )
            );
          }, SUBSCRIBE_TIMEOUT_MS);

          channel.subscribe((status, err) => {
            if (status === "SUBSCRIBED") {
              clearTimeout(timeoutId);
              subscribedOk = true;
              resolve();
              return;
            }
            if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              clearTimeout(timeoutId);
              if (!pageVisibleRef.current) {
                resolve();
                return;
              }
              reject(
                err ??
                  new Error(
                    `[GlobalSocketProvider] subscribe ${status}: ${normalizedId}`
                  )
              );
            }
          });
        });

        if (!subscribedOk) {
          await supabase.removeChannel(channel);
          return;
        }

        channelsRef.current.set(normalizedId, channel);
        if (!subscribedRoomIdsRef.current.includes(normalizedId)) {
          subscribedRoomIdsRef.current = [
            ...subscribedRoomIdsRef.current,
            normalizedId,
          ];
        }
      })();

      subscribingRef.current.set(normalizedId, task);
      try {
        await task;
      } catch (e) {
        const ch = channelsRef.current.get(normalizedId);
        if (ch) {
          await supabase.removeChannel(ch);
          channelsRef.current.delete(normalizedId);
        }
        if (pageVisibleRef.current) {
          console.error("[GlobalSocketProvider] subscribeToRoom failed", e);
        }
      } finally {
        subscribingRef.current.delete(normalizedId);
      }
    },
    [ingestMessage, ingestSystemMessage]
  );

  const reconnectVisibleRooms = useCallback(async () => {
    if (!pageVisibleRef.current || !readStoredToken()) return;

    const supabase = getBrowserSupabaseClient();
    const roomIds = new Set(subscribedRoomIdsRef.current);
    const activeId = activeRoomIdRef.current?.trim();
    if (activeId) roomIds.add(activeId);

    if (roomIds.size === 0) return;

    for (const id of roomIds) {
      const ch = channelsRef.current.get(id);
      if (ch) {
        await supabase.removeChannel(ch);
        channelsRef.current.delete(id);
      }
      subscribingRef.current.delete(id);
    }

    await Promise.all([...roomIds].map((id) => subscribeToRoom(id)));
  }, [subscribeToRoom]);

  const leaveRoomAndCleanup = useCallback(async (roomId: string) => {
    const normalizedId = roomId.trim();
    if (!normalizedId) return;

    const supabase = getBrowserSupabaseClient();
    const channel = channelsRef.current.get(normalizedId);
    if (channel) {
      await supabase.removeChannel(channel);
      channelsRef.current.delete(normalizedId);
    }
    subscribingRef.current.delete(normalizedId);
    subscribedRoomIdsRef.current = subscribedRoomIdsRef.current.filter(
      (id) => id !== normalizedId
    );

    clearRoomMessages(normalizedId);

    setRoomMessages((prev) => {
      if (!prev[normalizedId]) return prev;
      const next = { ...prev };
      delete next[normalizedId];
      return next;
    });
    setLatestMessages((prev) => {
      if (!prev[normalizedId]) return prev;
      const next = { ...prev };
      delete next[normalizedId];
      return next;
    });
    setUnreadCounts((prev) => {
      if (!prev[normalizedId]) return prev;
      const next = { ...prev };
      delete next[normalizedId];
      return next;
    });
    setRoomLeaveUi((prev) => {
      if (!prev[normalizedId]) return prev;
      const next = { ...prev };
      delete next[normalizedId];
      return next;
    });
  }, []);

  const ensureRoomChannel = useCallback(
    (roomId: string) => subscribeToRoom(roomId),
    [subscribeToRoom]
  );

  const syncRoomChannels = useCallback(
    async (roomIds: string[]) => {
      const token = readStoredToken();
      if (!token) {
        await teardownChannels();
        return;
      }

      const supabase = getBrowserSupabaseClient();
      const nextIds = [
        ...new Set(roomIds.map((id) => id.trim()).filter(Boolean)),
      ];
      const prevIds = subscribedRoomIdsRef.current;

      for (const id of prevIds) {
        if (!nextIds.includes(id)) {
          const ch = channelsRef.current.get(id);
          if (ch) {
            await supabase.removeChannel(ch);
            channelsRef.current.delete(id);
          }
        }
      }

      await Promise.all(nextIds.map((id) => subscribeToRoom(id)));
      subscribedRoomIdsRef.current = nextIds;
    },
    [subscribeToRoom, teardownChannels]
  );

  const refreshRooms = useCallback(() => {
    const token = readStoredToken();
    const user = readStoredUser();
    if (!token || !user) return;

    currentUserIdRef.current = user.userId;

    void (async () => {
      try {
        const res = await fetch("/api/chat", {
          headers: { Authorization: `Bearer ${token}` },
        });
        let data: { ok?: boolean; rooms?: ChatRoomListItemDTO[] } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          /* ignore */
        }
        if (!res.ok || !data.ok || !Array.isArray(data.rooms)) return;
        await syncRoomChannels(data.rooms.map((r) => r.roomId));
      } catch (e) {
        console.error("[GlobalSocketProvider] refreshRooms failed", e);
      }
    })();
  }, [syncRoomChannels]);

  useEffect(() => {
    return () => {
      void teardownChannels();
    };
  }, [teardownChannels]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      pageVisibleRef.current = visible;
      if (visible) {
        void reconnectVisibleRooms();
      }
    };

    pageVisibleRef.current = readPageVisible();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reconnectVisibleRooms]);

  useEffect(() => {
    const user = readStoredUser();
    currentUserIdRef.current = user?.userId ?? null;
    if (user && readStoredToken() && pathname && !pathname.startsWith("/login")) {
      refreshRooms();
    }
  }, [pathname, refreshRooms]);

  useEffect(() => {
    if (!activeRoomId) return;
    setUnreadCounts((prev) => {
      if (!prev[activeRoomId]) return prev;
      const next = { ...prev };
      delete next[activeRoomId];
      return next;
    });
  }, [activeRoomId]);

  const getRoomMessages = useCallback(
    (roomId: string) => roomMessages[roomId] ?? [],
    [roomMessages]
  );

  const value = useMemo(
    () => ({
      roomMessages,
      latestMessages,
      unreadCounts,
      roomLeaveUi,
      activeRoomId,
      refreshRooms,
      ensureRoomChannel,
      receiveMessage,
      getRoomMessages,
      leaveRoomAndCleanup,
      disconnectAllSockets,
      setPendingInviteEntryRoomId,
      consumePendingInviteEntry,
    }),
    [
      roomMessages,
      latestMessages,
      unreadCounts,
      roomLeaveUi,
      activeRoomId,
      refreshRooms,
      ensureRoomChannel,
      receiveMessage,
      getRoomMessages,
      leaveRoomAndCleanup,
      disconnectAllSockets,
      setPendingInviteEntryRoomId,
      consumePendingInviteEntry,
    ]
  );

  return (
    <GlobalSocketContext.Provider value={value}>
      {children}
    </GlobalSocketContext.Provider>
  );
}
