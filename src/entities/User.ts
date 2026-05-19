export interface User {
  userId: string;
  studentId: string;
  password: string;
  name?: string | null; // nullable
  universityName: string;
  role: string | "USER" | "ADMIN";
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
  token: string;
};

/** 사용자 검색 API 응답 DTO */
export interface UserSearchResultDTO {
  userId: string;
  studentId: string;
  name: string;
  universityName: string;
  isOnline: boolean;
}
