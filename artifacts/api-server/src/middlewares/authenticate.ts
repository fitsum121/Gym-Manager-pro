import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import { db, ownersTable, staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token." });
    return;
  }

  // Verify the account still exists in the DB — catches deleted accounts
  // that still hold a valid JWT.
  try {
    if (payload.role === "staff") {
      const [staff] = await db
        .select({ id: staffTable.id })
        .from(staffTable)
        .where(eq(staffTable.id, payload.sub))
        .limit(1);
      if (!staff) {
        res.status(401).json({ error: "Account no longer exists. Please contact your gym owner." });
        return;
      }
    } else {
      const [owner] = await db
        .select({ id: ownersTable.id })
        .from(ownersTable)
        .where(eq(ownersTable.id, payload.sub))
        .limit(1);
      if (!owner) {
        res.status(401).json({ error: "Account no longer exists. Please register again." });
        return;
      }
    }
  } catch {
    // DB error — fail open so a temporary outage doesn't lock everyone out
    // The request proceeds; downstream handlers will fail gracefully if needed.
  }

  req.user = {
    userId: payload.sub,
    gymId: payload.gymId,
    role: payload.role,
    name: payload.name,
  };

  next();
}
