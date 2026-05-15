import { NextResponse } from "next/server";
import { UserSearchController } from "@/controllers/UserSearchController";

const userSearchController = new UserSearchController();

const USER_NOT_FOUND_MESSAGE = "해당 사용자가 없습니다.";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const studentId =
      typeof body.studentId === "string" ? body.studentId.trim() : "";
    const universityName =
      typeof body.universityName === "string"
        ? body.universityName.trim()
        : "";

    if (!studentId || !universityName) {
      return NextResponse.json(
        { ok: false, error: "학번과 학교명을 입력하여 주세요." },
        { status: 400 }
      );
    }

    const result = await userSearchController.searchUser(
      studentId,
      universityName
    );

    if (!result) {
      return NextResponse.json(
        { ok: false, error: USER_NOT_FOUND_MESSAGE },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[POST /api/search]", e);
    return NextResponse.json(
      { ok: false, error: "Search failed" },
      { status: 500 }
    );
  }
}
