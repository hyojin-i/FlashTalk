import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { UserController } from "@/controllers/UserController";
import type { SessionPayload } from "@/entities/User";
import { SESSION_COOKIE } from "@/lib/session";

const userController = new UserController();

function parseSessionPayload(raw: string | undefined): SessionPayload | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const o = data as Record<string, unknown>;
    if (typeof o.userId !== "string" || !o.userId.trim()) return null;
    return data as SessionPayload;
  } catch {
    return null;
  }
}

function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const session = parseSessionPayload(cookieStore.get(SESSION_COOKIE)?.value);

    if (!session) {
      const res = NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
      clearSessionCookie(res);
      return res;
    }

    const ok = await userController.logout(session.userId);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Logout failed" },
        { status: 500 }
      );
    }

    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    return res;
  } catch (e) {
    console.error("[POST /api/users/logout]", e);
    return NextResponse.json(
      { ok: false, error: "Logout failed" },
      { status: 500 }
    );
  }
}
