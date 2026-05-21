import { DBConnectionManager } from "@/lib/DBConnectionManager";
import type { User, UserDTO } from "@/entities/User";

export class UserRepository {
  private static get db() {
    return DBConnectionManager.getInstance().getClient();
  }

  /**
   * 학번·학교로 `User` 테이블을 조회합니다.
   * `DBConnectionManager.getInstance()`로 클라이언트를 사용합니다.
   */
  async inqueryUserInfo(
    studentId: string,
    universityName: string
  ): Promise<User | null> {
    const { data, error } = await UserRepository.db
      .from("User")
      .select("userId, studentId, name, universityName, password, role")
      .eq("studentId", studentId)
      .eq("universityName", universityName)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) return null;
    return data as User;
  }

  /** `userId` 목록으로 `User` 행을 조회합니다. */
  async getUserInfo(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) return [];

    const { data, error } = await UserRepository.db
      .from("User")
      .select("userId, studentId, name, universityName, role")
      .in("userId", userIds);

    if (error) {
      console.error("[UserRepository.getUserInfo]", error.message);
      throw new Error(error.message);
    }

    const users = (data ?? []) as User[];
    const order = new Map(userIds.map((id, index) => [id, index]));
    return users.sort(
      (a, b) =>
        (order.get(a.userId) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.userId) ?? Number.MAX_SAFE_INTEGER)
    );
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