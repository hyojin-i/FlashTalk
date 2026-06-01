import { NextResponse } from "next/server";
import { UserRepository } from "@/repositories/UserRepository";

const userRepository = new UserRepository();

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const record = body && typeof body === "object" ? body : {};
    const studentId =
      typeof (record as { studentId?: unknown }).studentId === "string"
        ? (record as { studentId: string }).studentId
        : "";
    const universityName =
      typeof (record as { universityName?: unknown }).universityName ===
      "string"
        ? (record as { universityName: string }).universityName
        : "";

    if (!studentId.trim() || !universityName.trim()) {
      return NextResponse.json(
        { error: "studentId and universityName are required" },
        { status: 400 }
      );
    }

    const exists = await userRepository.checkUserExists(
      studentId.trim(),
      universityName.trim()
    );
    return NextResponse.json({ exists });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/users/verify]", message, e);

    if (
      message.includes("SUPABASE") ||
      message.includes("Supabase") ||
      message.includes("must be set")
    ) {
      return NextResponse.json({ error: message }, { status: 503 });
    }

    return NextResponse.json(
      { error: "Failed to verify user" },
      { status: 500 }
    );
  }
}
