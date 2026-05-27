import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_JWT_KEY } from "@/lib/session";

let authInitPromise: Promise<void> | null = null;
let lastAuthToken: string | null = null;

function readStoredToken(): string | null {
  try {
    const token = sessionStorage.getItem(CLIENT_JWT_KEY);
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Attaches the app JWT to the browser Realtime connection when available.
 * Falls back to the anon key if setAuth fails (e.g. mismatched SUPABASE_JWT_KEY).
 */
export async function ensureBrowserRealtimeAuth(
  client: SupabaseClient
): Promise<void> {
  const token = readStoredToken();

  if (token === lastAuthToken && authInitPromise) {
    await authInitPromise;
    return;
  }

  lastAuthToken = token;
  authInitPromise = (async () => {
    try {
      if (token) {
        await client.realtime.setAuth(token);
      } else {
        await client.realtime.setAuth(null);
      }
    } catch (error) {
      console.warn(
        "[ensureBrowserRealtimeAuth] setAuth failed; continuing with anon key",
        error
      );
    }
  })();

  await authInitPromise;
}

export function resetBrowserRealtimeAuth(): void {
  authInitPromise = null;
  lastAuthToken = null;
}
