import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod/v4";
import { coursesTable, courseInput, db, groupInput, mediaTable, stationInput, stationsTable, topicGroupsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
router.use("/admin", requireAdmin);
const storage = new ObjectStorageService();

const id = (req: Request) => Number(req.params.id);
const bad = (res: Response, error: z.ZodError) => res.status(400).json({ error: "Validation failed", issues: error.issues });
const pgCode = (e: unknown): string | undefined => {
  // drizzle wraps driver errors, so the Postgres code can sit on .cause
  for (let cur: unknown = e, i = 0; cur && typeof cur === "object" && i < 4; i++, cur = (cur as { cause?: unknown }).cause) {
    const code = (cur as { code?: string }).code;
    if (code) return code;
  }
  return undefined;
};
/** Turns known database errors into 4xx answers; rethrows anything else. */
function dbError(e: unknown, res: Response) {
  const code = pgCode(e);
  if (code === "23505") return void res.status(409).json({ error: "Slug already exists" });
  if (code === "23503") return void res.status(400).json({ error: "Referenced course or group does not exist" });
  throw e;
}

async function removeStoredMedia(rows: typeof mediaTable.$inferSelect[]) {
  for (const row of rows) {
    try {
      await storage.deleteObjectEntity(row.objectPath);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) throw error;
    }
  }
  if (rows.length) await db.delete(mediaTable).where(inArray(mediaTable.id, rows.map((row) => row.id)));
}

type Table = typeof coursesTable | typeof topicGroupsTable | typeof stationsTable;
function crud(path: string, table: Table, schema: z.ZodType<Record<string, unknown>>) {
  const t = table as typeof coursesTable;
  router.get(`/admin/${path}`, async (_req, res) => {
    res.json(await db.select().from(t).orderBy(asc(t.sortOrder), asc(t.id)));
  });
  router.get(`/admin/${path}/:id`, async (req, res) => {
    const [row] = await db.select().from(t).where(eq(t.id, id(req)));
    row ? res.json(row) : res.status(404).json({ error: "Not found" });
  });
  router.post(`/admin/${path}`, async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return void bad(res, parsed.error);
    try {
      const [row] = await db.insert(t).values(parsed.data as never).returning();
      res.status(201).json(row);
    } catch (e) { dbError(e, res); }
  });
  router.put(`/admin/${path}/:id`, async (req, res) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return void bad(res, parsed.error);
    try {
      const [row] = await db.update(t).set(parsed.data as never).where(eq(t.id, id(req))).returning();
      row ? res.json(row) : res.status(404).json({ error: "Not found" });
    } catch (e) { dbError(e, res); }
  });
  router.delete(`/admin/${path}/:id`, async (req, res) => {
    const itemId = id(req);
    const [exists] = await db.select({ id: t.id }).from(t).where(eq(t.id, itemId));
    if (!exists) return void res.status(404).json({ error: "Not found" });
    try {
      if (path === "courses") {
        const ownedStations = await db.select({ id: stationsTable.id }).from(stationsTable).where(eq(stationsTable.courseId, itemId));
        const mediaConditions = [eq(mediaTable.courseId, itemId)];
        if (ownedStations.length) mediaConditions.push(inArray(mediaTable.stationId, ownedStations.map((row) => row.id)));
        const files = await db.select().from(mediaTable).where(or(...mediaConditions));
        await removeStoredMedia(files);
      } else if (path === "stations") {
        const files = await db.select().from(mediaTable).where(eq(mediaTable.stationId, itemId));
        await removeStoredMedia(files);
      }
    } catch (error) {
      req.log.error({ err: error, itemId, path }, "Could not delete all stored course media");
      return void res.status(503).json({ error: "Course files could not be removed from storage. The content was not deleted." });
    }
    const [row] = await db.delete(t).where(eq(t.id, id(req))).returning({ id: t.id });
    row ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
  });
}

crud("courses", coursesTable, courseInput as never);
crud("groups", topicGroupsTable, groupInput as never);
crud("stations", stationsTable, stationInput as never);

// Drag-and-drop ordering: send the ids in their new order.
router.post("/admin/reorder", async (req, res) => {
  const parsed = z.object({ table: z.enum(["courses", "groups", "stations"]), ids: z.array(z.number().int()).min(1) }).safeParse(req.body);
  if (!parsed.success) return void bad(res, parsed.error);
  const t = ({ courses: coursesTable, groups: topicGroupsTable, stations: stationsTable }[parsed.data.table]) as typeof coursesTable;
  await db.transaction(async (tx) => {
    for (const [i, rowId] of parsed.data.ids.entries()) await tx.update(t).set({ sortOrder: i }).where(eq(t.id, rowId));
  });
  res.json({ ok: true });
});

// Quick publish/unpublish for several items at once.
router.post("/admin/status", async (req, res) => {
  const parsed = z.object({ table: z.enum(["courses", "stations"]), ids: z.array(z.number().int()).min(1), status: z.enum(["draft", "published"]) }).safeParse(req.body);
  if (!parsed.success) return void bad(res, parsed.error);
  const t = (parsed.data.table === "courses" ? coursesTable : stationsTable) as typeof coursesTable;
  await db.update(t).set({ status: parsed.data.status }).where(inArray(t.id, parsed.data.ids));
  res.json({ ok: true });
});

export default router;
