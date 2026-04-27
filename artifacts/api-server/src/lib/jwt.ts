import jwt from "jsonwebtoken";

export type Role = "owner" | "staff";

export type JwtPayload = {
  sub: string;    // userId (owner id or staff id)
  gymId: string;
  role: Role;
  name: string;
  iat?: number;
  exp?: number;
};

// Payload for a short-lived password-reset token issued after identity verification.
export type ResetTokenPayload = {
  purpose: "password-reset";
  email: string;  // normalised (lowercase)
  iat?: number;
  exp?: number;
};

function getSecret(): string {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET environment variable is required.");
  return secret;
}

export function signToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

/** Issues a 15-minute token that authorises one password reset for the given email. */
export function signResetToken(email: string): string {
  const payload: Omit<ResetTokenPayload, "iat" | "exp"> = {
    purpose: "password-reset",
    email,
  };
  return jwt.sign(payload, getSecret(), { expiresIn: "15m" });
}

/** Verifies a reset token and returns the payload, or null if invalid/expired. */
export function verifyResetToken(token: string): ResetTokenPayload | null {
  try {
    const payload = jwt.verify(token, getSecret()) as ResetTokenPayload;
    if (payload.purpose !== "password-reset") return null;
    return payload;
  } catch {
    return null;
  }
}
