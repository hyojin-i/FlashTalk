import { SignJWT, jwtVerify } from "jose";
import type { SessionUserDTO } from "@/entities/User";

const JWT_AUDIENCE = "authenticated";
const JWT_EXPIRY = "7d";

function getJwtSecret(): Uint8Array {
  const secret = process.env.SUPABASE_JWT_KEY;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_KEY is not set. In Supabase Dashboard → Project Settings → API → JWT Settings, copy the JWT Secret into .env or .env.local."
    );
  }
  return new TextEncoder().encode(secret);
}

export type VerifiedUserToken = {
  userId: string;
  role: "USER" | "ADMIN";
};

/** Signs a Supabase-compatible JWT for Realtime auth and API Bearer tokens. */
export async function signUserToken(user: SessionUserDTO): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.userId)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyUserToken(
  token: string
): Promise<VerifiedUserToken> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    audience: JWT_AUDIENCE,
  });
  const userId = payload.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Invalid token: missing subject");
  }
  const role = payload.role === "ADMIN" ? "ADMIN" : "USER";
  return { userId, role };
}
