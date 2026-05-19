import { NextResponse } from "next/server";
import { UserController } from "@/controllers/UserController";
import { getUserIdFromRequest } from "@/lib/auth-request";

const userController = new UserController();

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const ok = await userController.logout(userId);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Logout failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/users/logout]", e);
    return NextResponse.json(
      { ok: false, error: "Logout failed" },
      { status: 500 }
    );
  }
}
