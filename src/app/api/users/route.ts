import { NextResponse } from "next/server";
import { UserRepository } from "@/repositories/UserRepository";
import type { UserDTO } from "@/entities/User";

const userRepository = new UserRepository();

/** Used by `POST /api/users/verify` — checks registration in `User` table */
export async function verifyUserRegistration(
  studentId: string,
  universityName: string
): Promise<boolean> {
  return userRepository.checkUserExists(studentId, universityName);
}

export class UserController {
  constructor(private readonly repository: UserRepository = userRepository) {}

  async signUp(userDto: UserDTO): Promise<boolean> {
    return this.repository.save(userDto);
  }
}

const userController = new UserController(userRepository);

/** Used by `POST /api/users/signup` */
export async function signUpWithController(userDto: UserDTO): Promise<boolean> {
  return userController.signUp(userDto);
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
