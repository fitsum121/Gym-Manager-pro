import type { Request, Response, NextFunction } from "express";
import type { Role } from "../lib/jwt";

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "You don't have permission to perform this action." });
      return;
    }
    next();
  };
}
