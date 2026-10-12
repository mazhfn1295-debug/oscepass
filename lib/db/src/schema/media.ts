import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { coursesTable, stationsTable } from "./courses";

/** File bytes live in App Storage; PostgreSQL stores only metadata and ownership. */
export const mediaTable = pgTable("media", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  objectPath: text("object_path").notNull().unique(),
  courseId: integer("course_id").references(() => coursesTable.id, { onDelete: "cascade" }),
  stationId: integer("station_id").references(() => stationsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Media = typeof mediaTable.$inferSelect;
