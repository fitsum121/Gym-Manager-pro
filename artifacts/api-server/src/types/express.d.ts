import type { Role } from "../lib/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        gymId: string;
        role: Role;
        name: string;
      };
    }
  }
}
