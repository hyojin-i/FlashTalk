import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Singleton DB access. 회원가입(`UserRepository.save`)·조회 등 모든 DB 접근은
 * `DBConnectionManager.getInstance().getClient()`로 동일 인스턴스를 사용합니다.
 */
export class DBConnectionManager {
  private static instance: DBConnectionManager;
  private client: SupabaseClient;

  private constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // 환경 변수가 설정되지 않았을 경우 발생할 수 있는 런타임 에러를 방지
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Supabase 환경 변수가 설정되지 않았습니다. .env.local 파일에 NEXT_PUBLIC_SUPABASE_URL와 SUPABASE_SERVICE_ROLE_KEY가 있는지 확인해주세요."
      );
    }

    this.client = createClient(supabaseUrl, supabaseKey);
    console.log("DBConnectionManager가 환경 변수를 사용하여 초기화되었습니다.");
  }

  public static getInstance(): DBConnectionManager {
    if (!DBConnectionManager.instance) {
      DBConnectionManager.instance = new DBConnectionManager();
    }
    return DBConnectionManager.instance;
  }

  /** Repository에서 Supabase 쿼리 실행 시 사용 */
  public getClient(): SupabaseClient {
    return this.client;
  }
}
