import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { UserPresenceController } from "@/controllers/UserPresenceController";
import { UserRepository } from "@/repositories/UserRepository";
import type { LoginResult, SessionUserDTO, User, UserDTO } from "@/entities/User";

const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEYLEN = 64;

export class SignupPayloadInvalidError extends Error {
  readonly name = "SignupPayloadInvalidError";
  constructor() {
    super("Invalid or incomplete signup payload");
  }
}

export class UserNotFoundError extends Error {
  readonly name = "UserNotFoundError";
  constructor() {
    super("User not found");
  }
}

export class InvalidLoginPasswordError extends Error {
  readonly name = "InvalidLoginPasswordError";
  constructor() {
    super("Invalid password");
  }
}

/** scrypt 파생키를 `scrypt$N$r$p$saltHex$hashHex` 형태로 저장 (로그인 시 동일 방식으로 검증 가능) */
function hashPassword(plain: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPassword(plain: string, stored: string | undefined): boolean {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const hashHex = parts[5];
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

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

function userToSessionDTO(user: User): SessionUserDTO {
  const role: "USER" | "ADMIN" =
    user.role === "ADMIN" ? "ADMIN" : "USER";
  return {
    userId: user.userId,
    studentId: user.studentId ?? "",
    name: user.name ?? "",
    universityName: user.universityName ?? "",
    role,
  };
}

export class UserController {
  constructor(
    private readonly repository: UserRepository = new UserRepository(),
    private readonly presenceController: UserPresenceController = new UserPresenceController()
  ) {}

  /**
   * 학번·학교로 `User` 테이블에 등록된 사용자가 있는지 확인합니다.
   */
  async verifyStudentId(
    studentId: string,
    universityName: string
  ): Promise<boolean> {
    return this.repository.checkUserExists(studentId, universityName);
  }

  /**
   * 로그인: 사용자 조회 → 비밀번호 검증 → 접속 상태 갱신 → 사용자 DTO와 `sessionId` 반환.
   * @throws {UserNotFoundError} 해당 학번·학교 조합의 사용자가 없을 때
   * @throws {InvalidLoginPasswordError} 비밀번호가 일치하지 않을 때
   */
  async login(
    studentId: string,
    universityName: string,
    password: string
  ): Promise<LoginResult> {
    const user = await this.repository.inqueryUserInfo(
      studentId.trim(),
      universityName.trim()
    );
    if (!user) {
      throw new UserNotFoundError();
    }
    if (!verifyPassword(password, user.password)) {
      throw new InvalidLoginPasswordError();
    }
    const sessionId = randomUUID();
    await this.presenceController.updatePresence(user.userId, true, sessionId);
    return { user: userToSessionDTO(user), sessionId };
  }

  /**
   * 로그아웃: 접속 상태를 오프라인으로 갱신하고 `sessionId`를 제거합니다.
   */
  async logout(userId: string): Promise<boolean> {
    await this.presenceController.updatePresence(userId, false, null);
    return true;
  }

  /**
   * 클라이언트에서 받은 `UserDTO` 형태 본문을 검증·파싱하고 비밀번호를 해시한 뒤 저장합니다.
   * @throws {SignupPayloadInvalidError} 필수 필드가 없거나 형식이 잘못된 경우
   */
  async signUp(userDto: UserDTO): Promise<boolean> {
    const dto = parseUserDTO(userDto);
    if (!dto) {
      throw new SignupPayloadInvalidError();
    }
    const dtoToSave: UserDTO = {
      ...dto,
      password: hashPassword(dto.password),
    };
    return this.repository.save(dtoToSave);
  }
}
