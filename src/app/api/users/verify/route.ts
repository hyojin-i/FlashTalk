import { NextResponse } from "next/server";
import { verifyUserRegistration } from "../route";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const studentId = typeof body.studentId === "string" ? body.studentId : "";
    const universityName =
      typeof body.universityName === "string" ? body.universityName : "";

    if (!studentId.trim() || !universityName.trim()) {
      return NextResponse.json(
        { error: "studentId and universityName are required" },
        { status: 400 }
      );
    }

    const exists = await verifyUserRegistration(
      studentId.trim(),
      universityName.trim()
    );
    return NextResponse.json({ exists });
  } catch {
    return NextResponse.json(
      { error: "Failed to verify user" },
      { status: 500 }
    );
  }
}
