import { NextResponse } from "next/server";
import { signUpWithController } from "../route";
import type { UserDTO } from "@/entities/User";

function parseUserDTO(body: unknown): UserDTO | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const studentId = typeof o.studentId === "string" ? o.studentId.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const universityName =
    typeof o.universityName === "string" ? o.universityName.trim() : "";
  const password = typeof o.password === "string" ? o.password : "";
  if (!studentId || !name || !universityName || !password) return null;
  return { studentId, name, universityName, password };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dto = parseUserDTO(body);
    if (!dto) {
      return NextResponse.json(
        { ok: false, error: "Invalid or incomplete signup payload" },
        { status: 400 }
      );
    }

    const ok = await signUpWithController(dto);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Sign up failed (duplicate or server error)" },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to sign up" },
      { status: 500 }
    );
  }
}
