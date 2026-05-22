import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { SessionUserDTO } from "@/entities/User";

const JWT_AUDIENCE = "authenticated";
const JWT_EXPIRY = "7d";
const SUPABASE_ROLE = "authenticated";

function getJwtSecret(): Uint8Array {
  const secret = process.env.SUPABASE_JWT_KEY;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_KEY is not set. In Supabase Dashboard → Project Settings → API → JWT Settings, copy the JWT Secret (not the service_role key) into .env.local."
    );
  }
  return new TextEncoder().encode(secret);
}

function getJwtIssuer(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return url ? `${url}/auth/v1` : undefined;
}

export type VerifiedUserToken = {
  userId: string;
  role: "USER" | "ADMIN";
};

function appRoleFromPayload(payload: JWTPayload): "USER" | "ADMIN" {
  if (payload.app_role === "ADMIN") return "ADMIN";
  if (payload.role === "ADMIN") return "ADMIN";
  return "USER";
}

function verifiedFromPayload(payload: JWTPayload): VerifiedUserToken {
  const userId = payload.sub;
  if (!userId || typeof userId !== "string") {
    throw new Error("Invalid token: missing subject");
  }
  return { userId, role: appRoleFromPayload(payload) };
}

/**
 * Signs a Supabase-compatible JWT for Realtime `setAuth` and API Bearer tokens.
 * `role` must be `authenticated` (Postgres role); app role is stored in `app_role`.
 */
export async function signUserToken(user: SessionUserDTO): Promise<string> {
  const issuer = getJwtIssuer();
  let builder = new SignJWT({
    role: SUPABASE_ROLE,
    app_role: user.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.userId)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY);

  if (issuer) {
    builder = builder.setIssuer(issuer);
  }

  return builder.sign(getJwtSecret());
}

export async function verifyUserToken(
  token: string
): Promise<VerifiedUserToken> {
  const secret = getJwtSecret();
  const issuer = getJwtIssuer();
  const baseOptions = { audience: JWT_AUDIENCE };

  if (issuer) {
    try {
      const { payload } = await jwtVerify(token, secret, {
        ...baseOptions,
        issuer,
      });
      return verifiedFromPayload(payload);
    } catch {
      /* fall through for legacy tokens without matching iss */
    }
  }

  const { payload } = await jwtVerify(token, secret, baseOptions);
  return verifiedFromPayload(payload);
}
