import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Singleton DB access. 회원가입(`UserRepository.save`)·조회 등 모든 DB 접근은
 * `DBConnectionManager.getInstance().getClient()`로 동일 인스턴스를 사용합니다.
 */
export class DBConnectionManager {
  private static instance: DBConnectionManager;

  private constructor() {}

  public static getInstance(): DBConnectionManager {
    if (!DBConnectionManager.instance) {
      DBConnectionManager.instance = new DBConnectionManager();
    }
    return DBConnectionManager.instance;
  }

  /** Repository에서 Supabase 쿼리 실행 시 사용 (service role, RLS bypass). */
  public getClient(): SupabaseClient {
    return getSupabaseAdminClient();
  }
}
