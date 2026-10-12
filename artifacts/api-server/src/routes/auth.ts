import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { createToken, safeEqual, sessionCookie, verifyToken } from "../lib/session";

const router: IRouter = Router();
const attempts = new Map<string, { n: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.reset < now) { attempts.set(ip, { n: 1, reset: now + 15 * 60_000 }); return false; }
  rec.n += 1;
  return rec.n > 8;
}

router.post("/admin/login", (req, res) => {
  const ip = req.ip ?? "unknown";
  if (limited(ip)) { res.status(429).json({ error: "Too many attempts. Try again later." }); return; }
  const body = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) }).safeParse(req.body);
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) {
    res.status(503).json({ error: "Configure a unique admin password with at least 12 characters before signing in" });
    return;
  }
  if (!body.success || !safeEqual(body.data.username, username) || !safeEqual(body.data.password, password)) {
    res.status(401).json({ error: "Wrong username or password" });
    return;
  }
  attempts.delete(ip);
  res.cookie(sessionCookie.name, createToken(), sessionCookie.options());
  res.json({ ok: true });
});

router.post("/admin/logout", (_req, res) => {
  res.clearCookie(sessionCookie.name, { path: "/" });
  res.json({ ok: true });
});

router.get("/admin/me", (req, res) => {
  res.json({ authenticated: verifyToken(req.cookies?.[sessionCookie.name]) });
});

export default router;
