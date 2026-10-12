import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { coursesTable, db, mediaTable, stationsTable, topicGroupsTable } from "@workspace/db";

const router: IRouter = Router();
const summaryCols = {
  id: stationsTable.id, slug: stationsTable.slug, courseId: stationsTable.courseId, groupId: stationsTable.groupId,
  title: stationsTable.title, category: stationsTable.category, summary: stationsTable.summary,
  imageUrl: stationsTable.imageUrl, featured: stationsTable.featured, showOnHome: stationsTable.showOnHome,
  sortOrder: stationsTable.sortOrder,
};

router.get("/courses", async (_req, res) => {
  const courses = await db.select().from(coursesTable).where(eq(coursesTable.status, "published")).orderBy(asc(coursesTable.sortOrder), asc(coursesTable.id));
  res.json(courses);
});

router.get("/courses/:slug", async (req, res) => {
  const [course] = await db.select().from(coursesTable).where(and(eq(coursesTable.slug, req.params.slug), eq(coursesTable.status, "published")));
  if (!course) { res.status(404).json({ error: "Not found" }); return; }
  const [groups, stations, media] = await Promise.all([
    db.select().from(topicGroupsTable).where(eq(topicGroupsTable.courseId, course.id)).orderBy(asc(topicGroupsTable.sortOrder), asc(topicGroupsTable.id)),
    db.select(summaryCols).from(stationsTable).where(and(eq(stationsTable.courseId, course.id), eq(stationsTable.status, "published"))).orderBy(asc(stationsTable.sortOrder), asc(stationsTable.id)),
    db.select({
      id: mediaTable.id,
      filename: mediaTable.filename,
      mimeType: mediaTable.mimeType,
      size: mediaTable.size,
      createdAt: mediaTable.createdAt,
    }).from(mediaTable).where(eq(mediaTable.courseId, course.id)).orderBy(asc(mediaTable.createdAt), asc(mediaTable.id)),
  ]);
  res.json({ ...course, groups, stations, assets: media.map((asset) => ({ ...asset, url: `/api/media/${asset.id}` })) });
});

router.get("/stations", async (_req, res) => {
  const rows = await db.select(summaryCols).from(stationsTable).where(eq(stationsTable.status, "published")).orderBy(asc(stationsTable.sortOrder), asc(stationsTable.id));
  res.json(rows);
});

router.get("/stations/:slug", async (req, res) => {
  const [row] = await db.select().from(stationsTable).where(and(eq(stationsTable.slug, req.params.slug), eq(stationsTable.status, "published")));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

export default router;
