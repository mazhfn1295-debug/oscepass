import { Readable } from "node:stream";
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { coursesTable, db, mediaTable, stationsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";
import { sessionCookie, verifyToken } from "../lib/session";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const allowedTypes = [
  "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/webm",
  "application/pdf",
] as const;
const mimeType = z.enum(allowedTypes);

function sizeLimit(type: string) {
  if (type.startsWith("video/")) return MAX_VIDEO_BYTES;
  if (type.startsWith("image/")) return MAX_IMAGE_BYTES;
  return MAX_DOCUMENT_BYTES;
}

function streamResponse(res: Response, response: globalThis.Response) {
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; media-src 'self'; sandbox");
  if (response.body) {
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  } else {
    res.end();
  }
}

const uploadRequest = z.object({
  filename: z.string().trim().min(1).max(200),
  mimeType,
  size: z.number().int().positive(),
});

router.post("/admin/media/upload-url", requireAdmin, async (req: Request, res: Response) => {
  const parsed = uploadRequest.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid upload details", issues: parsed.error.issues });
  if (parsed.data.size > sizeLimit(parsed.data.mimeType)) {
    return void res.status(413).json({ error: "This file is larger than the allowed limit for its type" });
  }
  try {
    res.json(await storage.createUpload(parsed.data.mimeType));
  } catch (error) {
    req.log.error({ err: error }, "Could not create media upload URL");
    res.status(503).json({ error: "File storage is unavailable. Try again later." });
  }
});

router.post("/admin/media", requireAdmin, async (req: Request, res: Response) => {
  const parsed = z.object({
    ...uploadRequest.shape,
    objectPath: z.string().regex(/^\/objects\/uploads\/[a-zA-Z0-9-]+$/),
    courseId: z.number().int().positive().optional(),
    stationId: z.number().int().positive().optional(),
  }).refine((value) => !(value.courseId && value.stationId), "Attach an asset to a course or a station, not both").safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Invalid file details", issues: parsed.error.issues });
  const data = parsed.data;
  if (data.size > sizeLimit(data.mimeType)) return void res.status(413).json({ error: "This file is larger than the allowed limit for its type" });
  try {
    if (data.courseId) {
      const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).where(eq(coursesTable.id, data.courseId));
      if (!course) return void res.status(400).json({ error: "The selected course does not exist" });
    }
    if (data.stationId) {
      const [station] = await db.select({ id: stationsTable.id }).from(stationsTable).where(eq(stationsTable.id, data.stationId));
      if (!station) return void res.status(400).json({ error: "The selected station does not exist" });
    }
    const metadata = await storage.getObjectInfo(data.objectPath);
    const actualSize = metadata.size;
    if (actualSize !== data.size || metadata.contentType !== data.mimeType) {
      return void res.status(400).json({ error: "The uploaded file does not match its declared type or size" });
    }
    const safeFilename = data.filename.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 200);
    const [row] = await db.insert(mediaTable).values({
      filename: safeFilename,
      mimeType: data.mimeType,
      size: actualSize,
      objectPath: data.objectPath,
      courseId: data.courseId ?? null,
      stationId: data.stationId ?? null,
    }).returning({ id: mediaTable.id, filename: mediaTable.filename, mimeType: mediaTable.mimeType, size: mediaTable.size, createdAt: mediaTable.createdAt });
    res.status(201).json({ ...row, url: `/api/media/${row.id}` });
  } catch (error) {
    req.log.error({ err: error }, "Could not register uploaded media");
    if (error instanceof ObjectNotFoundError) return void res.status(400).json({ error: "The uploaded file could not be found" });
    res.status(503).json({ error: "Could not save the uploaded file. Please retry." });
  }
});

router.get("/admin/courses/:id/media", requireAdmin, async (req: Request, res: Response) => {
  const courseId = Number(req.params.id);
  if (!Number.isInteger(courseId) || courseId < 1) return void res.status(400).json({ error: "Invalid course" });
  const rows = await db.select({
    id: mediaTable.id,
    filename: mediaTable.filename,
    mimeType: mediaTable.mimeType,
    size: mediaTable.size,
    createdAt: mediaTable.createdAt,
    url: mediaTable.id,
  }).from(mediaTable).where(eq(mediaTable.courseId, courseId)).orderBy(asc(mediaTable.createdAt), asc(mediaTable.id));
  res.json(rows.map(({ url, ...row }) => ({ ...row, url: `/api/media/${url}` })));
});

router.delete("/admin/media/:id", requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return void res.status(404).json({ error: "Not found" });
  const [row] = await db.select().from(mediaTable).where(eq(mediaTable.id, id));
  if (!row) return void res.status(404).json({ error: "Not found" });
  try {
    await storage.deleteObjectEntity(row.objectPath);
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) {
      req.log.error({ err: error, mediaId: id }, "Could not delete stored media");
      return void res.status(503).json({ error: "Could not delete the file from storage. Try again." });
    }
  }
  await db.delete(mediaTable).where(eq(mediaTable.id, id));
  res.json({ ok: true });
});

router.get("/media/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return void res.status(404).json({ error: "Not found" });
  const [row] = await db.select().from(mediaTable).where(eq(mediaTable.id, id));
  if (!row) return void res.status(404).json({ error: "Not found" });

  const isAdmin = verifyToken(req.cookies?.[sessionCookie.name]);
  if (!isAdmin) {
    let visible = row.mimeType.startsWith("image/") && !row.courseId && !row.stationId;
    if (row.courseId) {
      const [course] = await db.select({ status: coursesTable.status }).from(coursesTable).where(and(
        eq(coursesTable.id, row.courseId),
        eq(coursesTable.status, "published"),
      ));
      visible = Boolean(course);
    } else if (row.stationId) {
      const [station] = await db.select({ id: stationsTable.id }).from(stationsTable)
        .innerJoin(coursesTable, eq(stationsTable.courseId, coursesTable.id))
        .where(and(eq(stationsTable.id, row.stationId), eq(stationsTable.status, "published"), eq(coursesTable.status, "published")));
      visible = Boolean(station);
    }
    if (!visible) return void res.status(404).json({ error: "Not found" });
  }

  try {
    const response = await storage.downloadObject(row.objectPath, 3600, req.headers.range);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
    streamResponse(res, response);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return void res.status(404).json({ error: "Not found" });
    req.log.error({ err: error, mediaId: id }, "Could not serve media");
    res.status(503).json({ error: "File temporarily unavailable" });
  }
});

export default router;
