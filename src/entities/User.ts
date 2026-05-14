export interface User {
  userId: string;
  studentId?: string;
  password?: string;
  name?: string | null; // 프론트엔드로 전달할 때는 보안상 제외될 수 있으므로 optional(?) 처리
  universityName?: string;
  role?: "USER" | "ADMIN";
}
