export interface User {
  userId: string;
  studentId?: string;
  password?: string;
  name?: string | null; // 프론트엔드로 전달할 때는 보안상 제외될 수 있으므로 optional(?) 처리
  universityName?: string;
  role?: "USER" | "ADMIN";
}

/** 회원가입 요청 본문 (클라이언트 → API) */
export interface UserDTO {
  studentId: string;
  name: string;
  universityName: string;
  password: string;
}
