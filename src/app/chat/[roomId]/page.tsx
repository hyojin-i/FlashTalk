"use client";

import type { FileInfoDTO } from "@/entities/FileInfoDTO";
import type { ParticipantsDTO } from "@/entities/Participants";
import type { SessionUserDTO, UserSearchResultDTO } from "@/entities/User";
import { readRoomMessages } from "@/lib/chat-room-messages-storage";
import { formatInviteWelcomeContent } from "@/lib/invite-welcome";
import type { ChatMessagePayload } from "@/lib/message-payload";
import { downloadFileFromUrl } from "@/lib/supabase-file-download";
import { CLIENT_JWT_KEY, CLIENT_USER_KEY } from "@/lib/session";
import {
  normalizeStudentId,
  validateStudentId,
} from "@/lib/student-id-validation";
import { useGlobalSocket } from "@/store/GlobalSocketProvider";
import { validateFile } from "@/utils/fileValidator";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { payloadToMessage } from "@/lib/message-payload";
import ChatBubble from "@/components/map/ChatBubble";
import AiChatBubble from "@/components/ai/ChatBubble";

const INVITE_SUCCESS_TOAST_MS = 4_000;
const PARTICIPANT_PRESENCE_POLL_MS = 60 * 1000;
const MAX_MESSAGE_LENGTH = 1000;
const MESSAGE_LENGTH_ERROR =
  "메시지는 최대 1000자까지 보낼 수 있습니다.";

const inviteInputClassName =
  "h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400";

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

function participantFromMembershipMessage(
  message: ChatMessagePayload
): ParticipantsDTO | null {
  if (message.type !== "system") return null;
  if (message.actionType !== "INVITE" && message.actionType !== "JOIN") {
    return null;
  }

  const userId = message.membershipUserId?.trim();
  if (!userId) return null;

  return {
    userId,
    name: message.membershipUserName?.trim() || "알 수 없음",
    studentId: message.membershipStudentId?.trim() || "",
    isOnline: false,
  };
}

function mergeParticipantList(
  prev: ParticipantsDTO[],
  incoming: ParticipantsDTO
): ParticipantsDTO[] {
  const index = prev.findIndex((p) => p.userId === incoming.userId);
  if (index === -1) return [...prev, incoming];
  const next = [...prev];
  next[index] = { ...next[index], ...incoming };
  return next;
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

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const rounded =
    unitIndex === 0 ? String(Math.round(size)) : size.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
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
  const {
    roomMessages,
    roomLeaveUi,
    getRoomMessages,
    ensureRoomChannel,
    receiveMessage,
    leaveRoomAndCleanup,
    refreshRooms,
    consumePendingInviteEntry,
  } = useGlobalSocket();

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
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteSearchStudentId, setInviteSearchStudentId] = useState("");
  const [inviteSearchUniversityName, setInviteSearchUniversityName] =
    useState("");
  const [inviteSearchPending, setInviteSearchPending] = useState(false);
  const [inviteSearchError, setInviteSearchError] = useState<string | null>(
    null
  );
  const [inviteSearchResults, setInviteSearchResults] = useState<
    UserSearchResultDTO[]
  >([]);
  const [inviteSelectedUserIds, setInviteSelectedUserIds] = useState<string[]>(
    []
  );
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccessToast, setInviteSuccessToast] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMembershipSyncIdRef = useRef<string | null>(null);

  const leaveUi = roomLeaveUi[roomId];
  const chatDisabled = leaveUi?.chatDisabled ?? false;

  const totalParticipantCount = participants.length + 1;

  const participantIdSet = useMemo(
    () => new Set(participants.map((p) => p.userId)),
    [participants]
  );

  const inviteSelectedUsers = useMemo(
    () =>
      inviteSelectedUserIds
        .map((id) => inviteSearchResults.find((u) => u.userId === id))
        .filter((u): u is UserSearchResultDTO => u != null),
    [inviteSelectedUserIds, inviteSearchResults]
  );

  const inviteVisibleUsers = useMemo(
    () =>
      inviteSearchResults.filter(
        (u) =>
          u.userId !== currentUser?.userId && !participantIdSet.has(u.userId)
      ),
    [inviteSearchResults, currentUser, participantIdSet]
  );

  const headerTitle = leaveUi?.partnerUnknown
    ? "(알 수 없음)"
    : formatParticipantHeaderTitle(participants);
  const headerSubtitle = leaveUi?.partnerUnknown
    ? "(알 수 없음)"
    : participants.length === 1
      ? participants[0].studentId
      : null;

  const attachFile = useCallback((file: File): void => {
    const result = validateFile(file);
    if (!result.isValid) {
      setAttachedFile(null);
      setAttachError(
        result.errorMessage ?? "이 파일은 전송할 수 없습니다."
      );
      return;
    }
    setAttachError(null);
    setAttachedFile(file);
  }, []);

  const requestLeaveRoom = useCallback(async (): Promise<void> => {
    const token = readStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setLeavePending(true);
    setLeaveError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "leave", roomId }),
      });

      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }

      if (!res.ok) {
        setLeaveError(
          typeof data.error === "string"
            ? data.error
            : "채팅방 나가기에 실패했습니다."
        );
        return;
      }

      setSettingsOpen(false);
      setLeaveModalOpen(false);
      await leaveRoomAndCleanup(roomId);
      refreshRooms();
      router.push("/main");
    } catch {
      setLeaveError("네트워크 오류가 발생했습니다.");
    } finally {
      setLeavePending(false);
    }
  }, [roomId, router, leaveRoomAndCleanup, refreshRooms]);

  const requestSendMessage = useCallback(async (): Promise<void> => {
    const trimmed = currentMessage.trim();
    const fileToSend = attachedFile;
    if ((!trimmed && !fileToSend) || isLoading || chatDisabled) return;

    if (trimmed.length >= MAX_MESSAGE_LENGTH) {
      setSendError(MESSAGE_LENGTH_ERROR);
      return;
    }

    const token = readStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setIsLoading(true);
    setSendError(null);
    setAttachError(null);
    const messageDraft = trimmed;
    setCurrentMessage("");

    try {
      if (fileToSend) {
        const uploadForm = new FormData();
        uploadForm.append("file", fileToSend);

        const uploadRes = await fetch("/api/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: uploadForm,
        });

        let uploadData: {
          ok?: boolean;
          fileInfo?: FileInfoDTO;
          error?: string;
        } = {};
        try {
          uploadData = (await uploadRes.json()) as typeof uploadData;
        } catch {
          /* ignore */
        }

        if (!uploadRes.ok || !uploadData.fileInfo) {
          setSendError(
            typeof uploadData.error === "string"
              ? uploadData.error
              : "파일 업로드에 실패했습니다."
          );
          setAttachedFile(fileToSend);
          return;
        }

        const chatRes = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            roomId,
            type: "file",
            content: JSON.stringify(uploadData.fileInfo),
          }),
        });

        let chatData: {
          ok?: boolean;
          message?: ChatMessagePayload;
          error?: string;
        } = {};
        try {
          chatData = (await chatRes.json()) as typeof chatData;
        } catch {
          /* ignore */
        }

        if (!chatRes.ok) {
          setSendError(
            typeof chatData.error === "string"
              ? chatData.error
              : "파일 메시지 전송에 실패했습니다."
          );
          setAttachedFile(fileToSend);
          return;
        }

        if (chatData.message) {
          receiveMessage(roomId, chatData.message);
        }
        setAttachedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roomId,
          type: "text",
          content: messageDraft,
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
        setCurrentMessage(messageDraft);
        return;
      }

      if (data.message) {
        receiveMessage(roomId, data.message);
      }
    } catch {
      setSendError("네트워크 오류가 발생했습니다.");
      if (fileToSend) {
        setAttachedFile(fileToSend);
      } else {
        setCurrentMessage(messageDraft);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    attachedFile,
    currentMessage,
    isLoading,
    roomId,
    router,
    receiveMessage,
    chatDisabled,
  ]);

  const reloadParticipants = useCallback(async (): Promise<void> => {
    const token = readStoredToken();
    if (!token) return;

    try {
      const res = await fetch(
        `/api/chat?roomId=${encodeURIComponent(roomId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      let data: {
        ok?: boolean;
        participants?: ParticipantsDTO[];
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (res.ok && data.ok && Array.isArray(data.participants)) {
        setParticipants(data.participants);
      }
    } catch {
      /* ignore */
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    const intervalId = window.setInterval(() => {
      void reloadParticipants();
    }, PARTICIPANT_PRESENCE_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [roomId, reloadParticipants]);

  function openInviteModal(): void {
    setInviteError(null);
    setInviteSearchError(null);
    setInviteSearchStudentId("");
    setInviteSearchResults([]);
    setInviteSelectedUserIds([]);
    setInviteSearchUniversityName(currentUser?.universityName ?? "");
    setInviteModalOpen(true);
  }

  function toggleInviteUserSelection(user: UserSearchResultDTO): void {
    setInviteError(null);
    setInviteSelectedUserIds((prev) => {
      if (prev.includes(user.userId)) {
        return prev.filter((id) => id !== user.userId);
      }
      if (!user.isOnline) return prev;
      return [...prev, user.userId];
    });
  }

  function mergeInviteSearchResult(result: UserSearchResultDTO): void {
    setInviteSearchResults((prev) => {
      const index = prev.findIndex((u) => u.userId === result.userId);
      if (index === -1) return [...prev, result];
      const next = [...prev];
      next[index] = result;
      return next;
    });
  }

  function requestInviteSearch(): void {
    setInviteSearchError(null);
    setInviteError(null);

    const studentIdError = validateStudentId(inviteSearchStudentId);
    if (studentIdError) {
      setInviteSearchError(studentIdError);
      return;
    }

    const studentId = normalizeStudentId(inviteSearchStudentId);
    const universityName = inviteSearchUniversityName.trim();

    if (!universityName) {
      setInviteSearchError("학교 이름을 입력해 주세요.");
      return;
    }

    setInviteSearchStudentId(studentId);
    setInviteSearchPending(true);
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
          setInviteSearchError(data.error ?? "해당 사용자가 없습니다.");
          return;
        }

        if (!res.ok || !data.ok || !data.result) {
          setInviteSearchError(
            typeof data.error === "string"
              ? data.error
              : "검색에 실패했습니다. 잠시 후 다시 시도해 주세요."
          );
          return;
        }

        mergeInviteSearchResult(data.result);
      } catch {
        setInviteSearchError("네트워크 오류가 발생했습니다.");
      } finally {
        setInviteSearchPending(false);
      }
    })();
  }

  const requestInviteFriends = useCallback(async (): Promise<void> => {
    if (inviteSelectedUserIds.length === 0 || invitePending) return;

    const token = readStoredToken();
    if (!token || !currentUser) {
      router.replace("/login");
      return;
    }

    setInvitePending(true);
    setInviteError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "invite",
          roomId,
          inviterId: currentUser.userId,
          inviteeIdList: inviteSelectedUserIds,
        }),
      });

      let data: { ok?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }

      if (!res.ok) {
        setInviteError(
          typeof data.error === "string"
            ? data.error
            : "친구 초대에 실패했습니다."
        );
        return;
      }

      setInviteModalOpen(false);
      setInviteSelectedUserIds([]);
      setInviteSearchResults([]);
      setInviteSuccessToast(true);
      await reloadParticipants();
      refreshRooms();
    } catch {
      setInviteError("네트워크 오류가 발생했습니다.");
    } finally {
      setInvitePending(false);
    }
  }, [
    inviteSelectedUserIds,
    invitePending,
    currentUser,
    roomId,
    router,
    reloadParticipants,
    refreshRooms,
  ]);

  useEffect(() => {
    const user = readStoredUser();
    if (user) setCurrentUser(user);
  }, []);

  useEffect(() => {
    if (!inviteSuccessToast) return;
    const timeoutId = window.setTimeout(() => {
      setInviteSuccessToast(false);
    }, INVITE_SUCCESS_TOAST_MS);
    return () => window.clearTimeout(timeoutId);
  }, [inviteSuccessToast]);

  useEffect(() => {
    const pendingRoomId = consumePendingInviteEntry();
    if (!pendingRoomId || pendingRoomId !== roomId) return;

    const user = readStoredUser();
    if (!user) return;

    const welcomeContent = formatInviteWelcomeContent(user.name ?? "");
    const stored = readRoomMessages(roomId);
    const alreadyShown = stored.some(
      (m) =>
        m.type === "system" &&
        m.actionType === "JOIN" &&
        m.content === welcomeContent
    );
    if (alreadyShown) return;

    const token = readStoredToken();
    if (!token) return;

    void (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "enter", roomId }),
        });

        let data: {
          ok?: boolean;
          message?: ChatMessagePayload;
          error?: string;
        } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          /* ignore */
        }

        if (!res.ok || !data.ok || !data.message) return;

        receiveMessage(roomId, data.message);
      } catch {
        /* ignore */
      }
    })();
  }, [roomId, consumePendingInviteEntry, receiveMessage]);

  useEffect(() => {
    lastMembershipSyncIdRef.current = null;
  }, [roomId]);

  useEffect(() => {
    void ensureRoomChannel(roomId);
  }, [roomId, ensureRoomChannel]);

  useEffect(() => {
    const stored = readRoomMessages(roomId);
    const live = getRoomMessages(roomId);
    setTransientMessageList(mergeMessages(stored, live));
  }, [roomId, roomMessages, getRoomMessages]);

  useEffect(() => {
    const messages = mergeMessages(
      readRoomMessages(roomId),
      getRoomMessages(roomId)
    );

    setParticipants((prev) => {
      let current = prev;
      for (const message of messages) {
        const fromMembership = participantFromMembershipMessage(message);
        if (fromMembership) {
          current = mergeParticipantList(current, fromMembership);
        }
      }

      if (
        current.length === prev.length &&
        current.every(
          (p, i) =>
            p.userId === prev[i]?.userId &&
            p.name === prev[i]?.name &&
            p.studentId === prev[i]?.studentId
        )
      ) {
        return prev;
      }
      return current;
    });

    const latestMembership = [...messages]
      .reverse()
      .find(
        (m) =>
          m.type === "system" &&
          (m.actionType === "INVITE" || m.actionType === "JOIN")
      );

    if (!latestMembership) return;
    if (lastMembershipSyncIdRef.current === latestMembership.id) return;

    lastMembershipSyncIdRef.current = latestMembership.id;
    void reloadParticipants();
  }, [roomId, roomMessages, getRoomMessages, reloadParticipants]);

  useEffect(() => {
    const myUserId = currentUser?.userId;
    if (!myUserId) return;

    const participantIds = new Set(participants.map((p) => p.userId));
    const hasUnknownSender = transientMessageList.some(
      (m) =>
        (m.type === "text" || m.type === "file") &&
        m.senderId &&
        m.senderId !== myUserId &&
        !participantIds.has(m.senderId)
    );

    if (hasUnknownSender) {
      void reloadParticipants();
    }
  }, [transientMessageList, participants, currentUser, reloadParticipants]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (transientMessageList.length === 0) return;
    scrollToBottom();
  }, [transientMessageList, scrollToBottom]);

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
            const isMine =
              currentUser != null && msg.senderId === currentUser.userId;
            const senderName = resolveSenderName(
              msg.senderId,
              currentUser,
              participants
            );
            const timeLabel = formatMessageTime(msg.createdAt);

            if (msg.type === "system") {
              return (
                <div key={msg.id} className="my-2 flex justify-center">
                  <span className="rounded-full bg-zinc-200 px-4 py-1.5 text-xs text-zinc-600">
                    {msg.content}
                  </span>
                </div>
              );
            }

            if (msg.type === "file") {
              const fileName = msg.fileName ?? "파일";
              const fileUrl = msg.fileUrl ?? "";
              const fileSizeLabel = formatFileSize(msg.fileSize ?? 0);

              const fileBubble = (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-inherit">
                    {fileName}
                  </span>
                  <span className="text-xs opacity-80">{fileSizeLabel}</span>
                  {fileUrl ? (
                    <button
                      type="button"
                      onClick={() => downloadFileFromUrl(fileUrl, fileName)}
                      className="inline-flex w-fit items-center gap-1 rounded-lg border border-current/20 px-2.5 py-1 text-xs font-medium hover:opacity-80"
                    >
                      저장
                    </button>
                  ) : null}
                </div>
              );

              if (isMine) {
                return (
                  <div key={msg.id} className="flex flex-col items-end gap-1">
                    <div
                      className="rounded-2xl rounded-tr-none px-4 py-2.5 text-white"
                      style={{ backgroundColor: "#d070fb" }}
                    >
                      {fileBubble}
                    </div>
                    <span className="text-[11px] text-zinc-400">
                      {timeLabel}
                    </span>
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
                    <div className="rounded-2xl rounded-tl-none bg-white px-4 py-2.5 text-zinc-800 shadow-sm">
                      {fileBubble}
                    </div>
                    <span className="text-[11px] text-zinc-400">
                      {timeLabel}
                    </span>
                  </div>
                </div>
              );
            }

            if (msg.type === "map") {
              try {
                const mapMessageObj = payloadToMessage(msg) as any; 
                
                return (
                  <div key={msg.id} className="w-full flex flex-col mt-2">
                    {!isMine && <span className="ml-1 mb-1 text-xs font-medium text-zinc-600">{senderName}</span>}
                    
                    <div className={`flex w-full items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {!isMine && <ChatBubble message={mapMessageObj} isMe={false} senderName={senderName} />}
                      
                      <span className="text-[11px] text-zinc-400 mb-1 shrink-0">{timeLabel}</span>
                      
                      {isMine && <ChatBubble message={mapMessageObj} isMe={true} senderName={senderName} />}
                    </div>
                  </div>
                );
              } catch (err) {
                console.error("Failed to render map message:", err);
                return <div key={msg.id} className="text-xs text-red-500 text-center my-2">오류: 지도 메시지를 불러올 수 없습니다.</div>;
              }
            }

            if (msg.type === "ai_prompt") {
              try {
                const aiMessageObj = payloadToMessage(msg) as any; 
                
                const aiBubbleData = {
                  prompt: aiMessageObj.prompt,
                  response: aiMessageObj.response,
                  model: aiMessageObj.model
                };

                return (
                  <div key={msg.id} className="w-full flex flex-col mt-3 mb-1">
                    {!isMine && <span className="ml-1 mb-1 text-xs font-bold text-zinc-600">{senderName}</span>}
                    
                    <div className={`flex w-full items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {!isMine && <AiChatBubble message={aiBubbleData} isMe={false} senderName={senderName} />}
                      {!isMine && <span className="text-[11px] font-medium text-zinc-400 mb-1 shrink-0">{timeLabel}</span>}
                      
                      {isMine && <span className="text-[11px] font-medium text-zinc-400 mb-1 shrink-0">{timeLabel}</span>}
                      {isMine && <AiChatBubble message={aiBubbleData} isMe={true} senderName={senderName} />}
                    </div>
                  </div>
                );
              } catch (err) {
                console.error("Failed to render AI message:", err);
                return <div key={msg.id} className="text-xs text-red-500 text-center my-2 border border-red-200 p-2 rounded-lg bg-red-50">오류: AI 메시지를 렌더링할 수 없습니다.</div>;
              }
            }

            if (msg.type !== "text") return null;

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
          {chatDisabled && (
            <div className="sticky bottom-0 flex justify-center py-2">
              <span className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-center text-xs text-red-600">
                대화 상대가 채팅방을 나갔습니다. 대화를 이어갈 수 없습니다.
              </span>
            </div>
          )}
          <div ref={messagesEndRef} className="h-0 shrink-0" aria-hidden />
        </main>

        {/* Footer */}
        <footer className="flex shrink-0 flex-col gap-1 bg-white p-4">
          {attachError && (
            <p className="text-center text-xs text-red-500">{attachError}</p>
          )}
          {sendError && (
            <p className="text-center text-xs text-red-500">{sendError}</p>
          )}
          {attachedFile && (
            <div className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-700">
              <span className="truncate">
                {attachedFile.name} ({formatFileSize(attachedFile.size)})
              </span>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setAttachedFile(null);
                  setAttachError(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="ml-2 shrink-0 text-zinc-500 hover:text-black disabled:opacity-50"
              >
                제거
              </button>
            </div>
          )}
          <form
            className="flex items-center gap-3"
            onSubmit={handleSubmit}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              disabled={isLoading || chatDisabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) attachFile(file);
              }}
            />
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center text-zinc-500 hover:text-black disabled:opacity-50"
              disabled={isLoading || chatDisabled}
              aria-label="파일 첨부"
              onClick={() => fileInputRef.current?.click()}
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
            <div
              className="flex flex-1 items-center rounded-xl bg-zinc-100 px-4 py-2.5"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (file) attachFile(file);
              }}
            >
              <input
                type="text"
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                disabled={isLoading || chatDisabled}
                placeholder={
                  chatDisabled
                    ? "대화 상대가 나가 대화를 이어갈 수 없습니다"
                    : "메시지를 입력하세요"
                }
                className="w-full bg-transparent text-sm text-black outline-none placeholder:text-zinc-500 disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={
                chatDisabled ||
                isLoading ||
                (!currentMessage.trim() && !attachedFile)
              }
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
              <span className="relative shrink-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-sm font-semibold text-white">
                  {currentUser ? nameInitial(currentUser.name) : "나"}
                </span>
                <span
                  className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
                  aria-hidden
                />
              </span>
              <span className="min-w-0 flex-1 text-sm text-zinc-800">
                <span className="font-medium text-zinc-900">나</span>
                <span className="mt-0.5 block text-xs text-emerald-600">
                  온라인
                </span>
              </span>
            </li>
            {participants.map((p) => {
              const online = p.isOnline;
              return (
                <li key={p.userId} className="flex items-center gap-3">
                  <span className="relative shrink-0">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-200 text-sm font-semibold text-violet-800">
                      {nameInitial(p.name)}
                    </span>
                    <span
                      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${
                        online ? "bg-emerald-500" : "bg-zinc-400"
                      }`}
                      aria-hidden
                    />
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-zinc-800">
                    <span className="font-medium text-zinc-900">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {p.studentId} · {online ? "온라인" : "오프라인"}
                    </span>
                  </span>
                </li>
              );
            })}
            {participantsLoading && participants.length === 0 && (
              <li className="text-sm text-zinc-500">불러오는 중…</li>
            )}
          </ul>

          <div className="my-6 border-t border-zinc-100" />

          <button
            type="button"
            onClick={openInviteModal}
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
            친구 초대
          </button>

          <button
            type="button"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
            onClick={() => {
              setLeaveError(null);
              setLeaveModalOpen(true);
            }}
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
            대화방 나가기
          </button>
        </div>
      </aside>

      {inviteSuccessToast && (
        <div
          className="fixed bottom-6 right-6 z-[70] rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 shadow-lg"
          role="status"
          aria-live="polite"
        >
          초대가 완료되었습니다.
        </div>
      )}

      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-dialog-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2
                id="invite-dialog-title"
                className="text-lg font-bold text-zinc-900"
              >
                친구 초대
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (!invitePending) setInviteModalOpen(false);
                }}
                disabled={invitePending}
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 disabled:opacity-60"
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

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  requestInviteSearch();
                }}
                className="flex flex-col gap-3"
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-zinc-700">
                    학교
                  </span>
                  <input
                    value={inviteSearchUniversityName}
                    onChange={(e) =>
                      setInviteSearchUniversityName(e.target.value)
                    }
                    autoComplete="organization"
                    placeholder="ex) 한국대"
                    className={inviteInputClassName}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-zinc-700">
                    학번
                  </span>
                  <input
                    value={inviteSearchStudentId}
                    onChange={(e) => setInviteSearchStudentId(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="ex) 20260001"
                    className={inviteInputClassName}
                  />
                </label>
                {inviteSearchError && (
                  <p className="text-sm text-red-600">{inviteSearchError}</p>
                )}
                <button
                  type="submit"
                  disabled={inviteSearchPending}
                  className="flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {inviteSearchPending ? "검색 중…" : "검색"}
                </button>
              </form>

              {inviteSelectedUsers.length > 0 && (
                <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3">
                  <span className="text-sm font-medium text-zinc-700">
                    {inviteSelectedUsers.length}명 선택됨
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {inviteSelectedUsers.map((user) => (
                      <span
                        key={user.userId}
                        className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        {user.name}
                      </span>
                    ))}
                  </div>
                  {inviteError && (
                    <p className="text-sm text-red-600">{inviteError}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void requestInviteFriends()}
                    disabled={invitePending}
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                  >
                    {invitePending ? "초대 중…" : "초대하기"}
                  </button>
                </section>
              )}

              <ul className="flex flex-col gap-2">
                {inviteSearchPending && inviteVisibleUsers.length === 0 && (
                  <li className="rounded-xl px-4 py-6 text-center text-sm text-zinc-500">
                    검색 중…
                  </li>
                )}
                {!inviteSearchPending && inviteVisibleUsers.length === 0 && (
                  <li className="rounded-xl px-4 py-6 text-center text-sm text-zinc-500">
                    학번과 학교명으로 검색해 주세요.
                  </li>
                )}
                {inviteVisibleUsers.map((user) => {
                  const isSelected = inviteSelectedUserIds.includes(
                    user.userId
                  );
                  const canSelect = user.isOnline || isSelected;
                  return (
                    <li key={user.userId}>
                      <button
                        type="button"
                        onClick={() => toggleInviteUserSelection(user)}
                        disabled={!canSelect}
                        className={`flex w-full items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 text-left transition-colors ${
                          isSelected
                            ? "border-sky-400 bg-sky-50/80"
                            : "border-transparent hover:border-zinc-200"
                        } ${!canSelect ? "cursor-not-allowed opacity-60" : ""}`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                            isSelected
                              ? "border-zinc-900 bg-zinc-900"
                              : "border-zinc-300 bg-white"
                          }`}
                          aria-hidden
                        >
                          {isSelected && (
                            <svg
                              className="h-3 w-3 text-white"
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
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-200 text-sm font-semibold text-violet-800">
                            {nameInitial(user.name)}
                          </span>
                          {user.isOnline && (
                            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-zinc-900">
                            {user.name}
                          </span>
                          <span className="mt-0.5 block text-sm text-zinc-500">
                            {user.studentId} | {user.universityName}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      {leaveModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-dialog-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h2
              id="leave-dialog-title"
              className="text-lg font-semibold text-zinc-900"
            >
              채팅방을 나가시겠습니까?
            </h2>
            {leaveError && (
              <p className="mt-3 text-sm text-red-600">{leaveError}</p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!leavePending) {
                    setLeaveError(null);
                    setLeaveModalOpen(false);
                  }
                }}
                disabled={leavePending}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:opacity-60"
              >
                아니오
              </button>
              <button
                type="button"
                onClick={() => void requestLeaveRoom()}
                disabled={leavePending}
                className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-60"
              >
                {leavePending ? "나가는 중…" : "예"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
