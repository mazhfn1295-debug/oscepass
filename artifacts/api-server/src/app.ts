import path from "node:path";
import { existsSync } from "node:fs";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Behind the hosting provider's HTTPS proxy: needed for the real client IP (rate limiting) and secure cookies.
app.set("trust proxy", 1);
app.use(cookieParser());

// Production: the site and the API share one origin, so cross-origin requests are refused unless
// CORS_ORIGINS (comma-separated list of site URLs) is set. Development: any origin.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? (allowedOrigins.length ? allowedOrigins : false) : true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api", (_req, res) => { res.status(404).json({ error: "Not found" }); });

// Serve the built website from the same origin as the API (so the admin cookie works without CORS).
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(import.meta.dirname, "../../oscepass/dist/public");
if (existsSync(staticDir)) {
  app.use(express.static(staticDir, { index: false, maxAge: "1h" }));
  app.use("/assets", (_req, res) => { res.status(404).end(); });
  app.get("/{*splat}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticDir, "index.html"));
  });
} else {
  logger.warn({ staticDir }, "Static site directory not found; serving API only");
}

// Never leak query text or stack traces to clients.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, url: req.url?.split("?")[0] }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
