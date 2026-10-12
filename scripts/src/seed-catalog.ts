import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { courseInput, coursesTable, db, groupInput, pool, stationInput, stationsTable, topicGroupsTable } from "@workspace/db";

// Idempotent: safe to run many times. Matches rows by slug (courses/stations) or name (groups).
const raw = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));

async function main() {
  const courseData = courseInput.parse(raw.course);
  const [course] = await db
    .insert(coursesTable).values(courseData)
    .onConflictDoUpdate({ target: coursesTable.slug, set: courseData })
    .returning();

  const groupIds = new Map<string, number>();
  for (const g of raw.groups as { name: string; sortOrder: number; topics: unknown[] }[]) {
    const data = groupInput.parse({ courseId: course.id, name: g.name, topics: g.topics, sortOrder: g.sortOrder });
    const [existing] = await db.select().from(topicGroupsTable)
      .where(and(eq(topicGroupsTable.courseId, course.id), eq(topicGroupsTable.name, g.name)));
    const [row] = existing
      ? await db.update(topicGroupsTable).set(data).where(eq(topicGroupsTable.id, existing.id)).returning()
      : await db.insert(topicGroupsTable).values(data).returning();
    groupIds.set(g.name, row.id);
  }

  for (const s of raw.stations as { group: string }[] & Record<string, unknown>[]) {
    const { group, ...rest } = s as Record<string, unknown> & { group: string };
    const data = stationInput.parse({ ...rest, courseId: course.id, groupId: groupIds.get(group) ?? null });
    await db.insert(stationsTable).values(data)
      .onConflictDoUpdate({ target: stationsTable.slug, set: data });
  }

  const count = (await db.select().from(stationsTable)).length;
  console.log(`Seeded course "${course.title}", ${groupIds.size} groups, ${count} stations total.`);
}

main()
  .catch((e) => { console.error(e instanceof z.ZodError ? JSON.stringify(e.issues, null, 2) : e); process.exitCode = 1; })
  .finally(() => pool.end());
