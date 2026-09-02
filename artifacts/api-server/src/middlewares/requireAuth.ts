import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

/**
 * Extracts the Clerk userId from the request session cookie and attaches
 * it to req.userId. Returns 401 if the request is not authenticated.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Attach so route handlers can read it without re-calling getAuth
  (req as Request & { userId: string }).userId = userId;
  next();
}
