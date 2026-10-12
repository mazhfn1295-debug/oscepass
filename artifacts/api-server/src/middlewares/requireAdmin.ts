import type { NextFunction, Request, Response } from "express";
import { sessionCookie, verifyToken } from "../lib/session";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!verifyToken(req.cookies?.[sessionCookie.name])) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
