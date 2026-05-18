import { NextResponse } from "next/server";
import { UserSearchController } from "@/controllers/UserSearchController";

const userSearchController = new UserSearchController();

const USER_NOT_FOUND_MESSAGE = "해당 사용자가 없습니다.";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const universityName =
      typeof body.universityName === "string"
        ? body.universityName.trim()
        : "";

    if (!universityName) {
      return NextResponse.json(
        { ok: false, error: "학교명을 입력하여 주세요." },
        { status: 400 }
      );
    }

    if (body.list === true) {
      const results = await userSearchController.listUsers(universityName);
      return NextResponse.json({ ok: true, results });
    }

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (query) {
      const results = await userSearchController.searchUsers(
        query,
        universityName
      );
      return NextResponse.json({ ok: true, results });
    }

    const studentId =
      typeof body.studentId === "string" ? body.studentId.trim() : "";
    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: "검색어 또는 학번을 입력하여 주세요." },
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
