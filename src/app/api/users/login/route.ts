import { NextResponse } from "next/server";
import {
  InvalidLoginPasswordError,
  UserController,
  UserNotFoundError,
} from "@/controllers/UserController";
import type { SessionPayload } from "@/entities/User";

const userController = new UserController();

const SESSION_COOKIE = "flashtalk_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const studentId =
      typeof body.studentId === "string" ? body.studentId.trim() : "";
    const universityName =
      typeof body.universityName === "string"
        ? body.universityName.trim()
        : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!studentId || !universityName || !password) {
      return NextResponse.json(
        { ok: false, error: "studentId, universityName, and password are required" },
        { status: 400 }
      );
    }

    const { user, sessionId } = await userController.login(
      studentId,
      universityName,
      password
    );

    const payload: SessionPayload = { ...user, sessionId };

    const res = NextResponse.json({ ok: true, user, sessionId });
    res.cookies.set(SESSION_COOKIE, JSON.stringify(payload), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SEC,
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  } catch (e) {
    if (e instanceof UserNotFoundError) {
      return NextResponse.json(
        { ok: false, error: "User not found for the given studentId and universityName" },
        { status: 404 }
      );
    }
    if (e instanceof InvalidLoginPasswordError) {
      return NextResponse.json(
        { ok: false, error: "Invalid password" },
        { status: 401 }
      );
    }
    console.error("[POST /api/users/login]", e);
    return NextResponse.json(
      { ok: false, error: "Login failed" },
      { status: 500 }
    );
  }
}
