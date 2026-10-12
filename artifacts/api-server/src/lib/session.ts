import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "osce_admin";
const TTL_MS = 1000 * 60 * 60 * 12;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (16+ chars)");
  return s;
}
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function createToken(): string {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: unknown): boolean {
  if (typeof token !== "string") return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

export const sessionCookie = {
  name: COOKIE,
  options: () => ({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL_MS,
    path: "/",
  }),
};
