import { DBConnectionManager } from "@/lib/DBConnectionManager";

export class UserRepository {
  async checkUserExists(
    studentId: string,
    universityName: string
  ): Promise<boolean> {
    const db = DBConnectionManager.getInstance().getClient();
    const { data, error } = await db
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
}
