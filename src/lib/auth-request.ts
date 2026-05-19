import { verifyUserToken } from "@/lib/jwt";

export async function getUserIdFromRequest(
  request: Request
): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    const { userId } = await verifyUserToken(token);
    return userId;
  } catch {
    return null;
  }
}
