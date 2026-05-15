export interface User {
  userId: string;
  studentId?: string;
  password?: string;
  name?: string | null; // 프론트엔드로 전달할 때는 보안상 제외될 수 있으므로 optional(?) 처리
  universityName: string;
  role: "USER" | "ADMIN";
}

/** 회원가입 요청 본문 (클라이언트 → API) */
export interface UserDTO {
  studentId: string;
  name: string;
  universityName: string;
  password: string;
}

/** 로그인 응답·세션용: `UserDTO`에서 비밀번호를 제외하고 `userId`·`role`을 포함합니다. */
export type SessionUserDTO = Omit<UserDTO, "password"> & {
  userId: string;
  role: "USER" | "ADMIN";
};

/** `UserController.login` 반환값 */
export type LoginResult = {
  user: SessionUserDTO;
  sessionId: string;
};

/** httpOnly 쿠키 등에 저장하는 사용자 세션 페이로드 */
export type SessionPayload = SessionUserDTO & { sessionId: string };
