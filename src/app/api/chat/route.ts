import { NextResponse } from "next/server";
import {
  ChatRoomController,
  ChatRoomParticipantRequiredError,
} from "@/controllers/ChatRoomController";
import { getUserIdFromRequest } from "@/lib/auth-request";
import { messageToPayload } from "@/lib/message-payload";

const chatRoomController = new ChatRoomController();

export async function GET(request: Request) {
  try {
    const myUserId = await getUserIdFromRequest(request);
    if (!myUserId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId")?.trim() ?? "";

    if (!roomId) {
      const rooms = await chatRoomController.getRoomList(myUserId);
      return NextResponse.json({ ok: true, rooms }, { status: 200 });
    }

    const participants = await chatRoomController.getParticipantsInfo(
      roomId,
      myUserId
    );

    return NextResponse.json({ ok: true, participants }, { status: 200 });
  } catch (e) {
    console.error("[GET /api/chat]", e);
    return NextResponse.json(
      { ok: false, error: "Failed to load chat room participants" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const hostUserId = await getUserIdFromRequest(request);
    if (!hostUserId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    const sendRoomId =
      typeof body.roomId === "string" ? body.roomId.trim() : "";
    const sendType = typeof body.type === "string" ? body.type.trim() : "";
    const sendContent =
      typeof body.content === "string" ? body.content : "";

    if (sendRoomId && sendType) {
      try {
        const message = await chatRoomController.sendMessage(
          sendRoomId,
          hostUserId,
          sendType,
          sendContent
        );
        return NextResponse.json(
          {
            ok: true,
            message: {
              ...messageToPayload(message),
              roomId: sendRoomId,
            },
          },
          { status: 200 }
        );
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Failed to send message";
        const status = message.includes("required") ? 400 : 500;
        return NextResponse.json({ ok: false, error: message }, { status });
      }
    }

    const rawIds = body.participantUserIds ?? body.selectedUserIds;
    if (!Array.isArray(rawIds)) {
      return NextResponse.json(
        { ok: false, error: "participantUserIds array is required" },
        { status: 400 }
      );
    }

    const selectedUserIds = rawIds.filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0
    );

    const userIdList = [
      ...new Set([hostUserId, ...selectedUserIds.map((id) => id.trim())]),
    ];

    const roomId = await chatRoomController.createRoom(userIdList, hostUserId);

    return NextResponse.json({ roomId }, { status: 200 });
  } catch (e) {
    if (e instanceof ChatRoomParticipantRequiredError) {
      return NextResponse.json(
        { ok: false, error: "대화 상대를 한 명 이상 선택해 주세요." },
        { status: 400 }
      );
    }
    console.error("[POST /api/chat]", e);
    return NextResponse.json(
      { ok: false, error: "Failed to create chat room" },
      { status: 500 }
    );
  }
}
