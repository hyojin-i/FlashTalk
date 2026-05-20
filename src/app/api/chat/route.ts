import { NextResponse } from "next/server";
import {
  ChatRoomController,
  ChatRoomParticipantRequiredError,
} from "@/controllers/ChatRoomController";
import { getUserIdFromRequest } from "@/lib/auth-request";

const chatRoomController = new ChatRoomController();

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
