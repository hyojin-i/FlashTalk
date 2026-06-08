import { NextResponse } from "next/server";
import {
  InvalidLoginPasswordError,
  UserController,
  UserNotFoundError,
} from "@/controllers/UserController";

const userController = new UserController();

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

    const { user, token } = await userController.login(
      studentId,
      universityName,
      password
    );

    return NextResponse.json({ ok: true, user, token });
  } catch (e) {
    if (e instanceof UserNotFoundError) {
      return NextResponse.json(
        { ok: false, error: "입력한 정보가 일치하지 않습니다. 학번과 학교명을 확인하여 주세요." },
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
