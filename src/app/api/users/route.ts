import { NextResponse } from "next/server";
import { UserRepository } from "@/repositories/UserRepository";

const userRepository = new UserRepository();

/** Used by `POST /api/users/verify` — checks registration in `User` table */
export async function verifyUserRegistration(
  studentId: string,
  universityName: string
): Promise<boolean> {
  return userRepository.checkUserExists(studentId, universityName);
}

export class UserController {
  // 사용자 관리 로직
}

export class UserSearchController {
  // 사용자 검색 로직
}

export async function GET() {
  return NextResponse.json({ message: "Users API Route" });
}

export async function POST() {
  return NextResponse.json({ message: "Users API Route - POST" });
}
