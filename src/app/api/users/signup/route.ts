import { NextResponse } from "next/server";
import {
  SignupPayloadInvalidError,
  UserController,
} from "@/controllers/UserController";
import type { UserDTO } from "@/entities/User";

const userController = new UserController();

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UserDTO;
    const ok = await userController.signUp(body);
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: "Sign up failed (duplicate or server error)" },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SignupPayloadInvalidError) {
      return NextResponse.json(
        { ok: false, error: "Invalid or incomplete signup payload" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "Failed to sign up" },
      { status: 500 }
    );
  }
}
