import { randomBytes, scryptSync } from "node:crypto";
import { UserRepository } from "@/repositories/UserRepository";
import type { UserDTO } from "@/entities/User";

const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEYLEN = 64;

export class SignupPayloadInvalidError extends Error {
  readonly name = "SignupPayloadInvalidError";
  constructor() {
    super("Invalid or incomplete signup payload");
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

export class UserController {
  constructor(private readonly repository: UserRepository = new UserRepository()) {}

  /**
   * 학번·학교로 `User` 테이블에 등록된 사용자가 있는지 확인합니다.
   * (기존 `verify/route`의 `verifyUserRegistration`과 동일한 비즈니스 규칙)
   */
  async verifyStudentId(
    studentId: string,
    universityName: string
  ): Promise<boolean> {
    return this.repository.checkUserExists(studentId, universityName);
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
