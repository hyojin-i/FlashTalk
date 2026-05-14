import { DBConnectionManager } from "@/lib/DBConnectionManager";
import type { UserDTO } from "@/entities/User";

export class UserRepository {
  private static get db() {
    return DBConnectionManager.getInstance().getClient();
  }

  async checkUserExists(
    studentId: string,
    universityName: string
  ): Promise<boolean> {
    const { data, error } = await UserRepository.db
      .from("User")
      .select("userId")
      .eq("studentId", studentId)
      .eq("universityName", universityName)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data != null;
  }

  /**
   * `User` 테이블에 행 추가. 성공 시 `true`, DB 제약/삽입 실패 시 `false`.
   * `DBConnectionManager.getInstance()`로 클라이언트를 얻어 저장합니다.
   */
  async save(user: UserDTO): Promise<boolean> {
    
    const { error } = await  UserRepository.db.from("User").insert({
      studentId: user.studentId,
      name: user.name,
      universityName: user.universityName,
      password: user.password,
    });

    if (error) {
      console.error("[UserRepository.save]", error.message);
      return false;
    }
    return true;
  }
}