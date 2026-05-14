import { NextResponse } from "next/server";
import { UserController } from "@/controllers/UserController";

const userController = new UserController();

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

    const exists = await userController.verifyStudentId(
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
