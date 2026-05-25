import { NextResponse } from "next/server";
import { FileController } from "@/controllers/FileController";
import { getUserIdFromRequest } from "@/lib/auth-request";

const fileController = new FileController();

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File) || fileEntry.size === 0) {
      return NextResponse.json(
        { ok: false, error: "파일이 필요합니다." },
        { status: 400 }
      );
    }

    const fileInfo = await fileController.uploadFile(fileEntry, userId);

    return NextResponse.json({ ok: true, fileInfo }, { status: 200 });
  } catch (e) {
    console.error("[POST /api/files]", e);
    const message =
      e instanceof Error ? e.message : "파일 업로드에 실패했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
