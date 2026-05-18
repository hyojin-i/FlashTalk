import { NextResponse } from "next/server";
import { UserPresenceController } from "@/controllers/UserPresenceController";
import { getUserIdFromRequest } from "@/lib/auth-request";

const presenceController = new UserPresenceController();

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;

    if (body.heartbeat === true) {
      await presenceController.heartbeat(userId);
      return NextResponse.json({ ok: true });
    }

    if (typeof body.isOnline !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "isOnline (boolean) or heartbeat: true is required" },
        { status: 400 }
      );
    }

    await presenceController.updatePresence(userId, body.isOnline);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/presence]", e);
    return NextResponse.json(
      { ok: false, error: "Presence update failed" },
      { status: 500 }
    );
  }
}
