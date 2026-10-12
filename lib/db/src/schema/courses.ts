import { boolean, integer, jsonb, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const publishStatus = pgEnum("publish_status", ["draft", "published"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  tag: text("tag").notNull().default(""),
  description: text("description").notNull().default(""),
  meta: text("meta").notNull().default(""),
  icon: text("icon").notNull().default("brain"),
  imageUrl: text("image_url"),
  status: publishStatus("status").notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  showOnHome: boolean("show_on_home").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export type TopicItem = { title: string; stationSlug?: string };

export const topicGroupsTable = pgTable("topic_groups", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  topics: jsonb("topics").$type<TopicItem[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

const str = () => z.string().default("");
const list = () => z.array(z.string()).default([]);

export const stationContentSchema = z.object({
  aim: str(),
  learningOutcomes: list(),
  instructions: str(),
  witnessLabel: z.string().default("Witness"),
  timing: z.object({ historyMin: z.number().int().min(1), examinerMin: z.number().int().min(0) }).default({ historyMin: 8, examinerMin: 2 }),
  totalMarks: z.number().int().min(1).default(20),
  actorBriefs: z.array(z.object({
    role: z.string(),
    notes: list(),
    items: list(),
    table: z.array(z.object({ topic: z.string(), response: z.string() })).default([]),
  })).default([]),
  history: z.array(z.object({
    title: z.string(),
    lines: z.array(z.object({ speaker: z.enum(["doctor", "patient", "witness", "note"]), label: z.string().optional(), text: z.string() })),
  })).default([]),
  markScheme: z.array(z.object({ domain: z.string(), expected: z.string().optional(), max: z.number().int().min(0) })).default([]),
  globalRating: z.array(z.object({ grade: z.string(), description: z.string() })).default([]),
  commonErrors: list(),
  examinerExpects: z.array(z.object({ task: z.string(), expected: z.string() })).default([]),
  reactions: z.array(z.object({ situation: z.string(), response: z.string() })).default([]),
  plainLanguage: z.array(z.object({ term: z.string(), say: z.string() })).default([]),
  patientQuestions: z.array(z.object({ question: z.string(), reply: z.string() })).default([]),
  howToAnswer: list(),
  redFlags: list(),
  questions: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  teachingPoints: list(),
  resources: z.array(z.object({ label: z.string(), url: z.string().optional() })).default([]),
});
export type StationContent = z.infer<typeof stationContentSchema>;

export const stationsTable = pgTable("stations", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  courseId: integer("course_id").notNull().references(() => coursesTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").references(() => topicGroupsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  category: text("category").notNull().default(""),
  summary: text("summary").notNull().default(""),
  imageUrl: text("image_url"),
  status: publishStatus("status").notNull().default("draft"),
  featured: boolean("featured").notNull().default(false),
  showOnHome: boolean("show_on_home").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  content: jsonb("content").$type<StationContent>().notNull(),
  ...timestamps,
});

const slug = z.string().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, numbers and dashes only");

export const courseInput = createInsertSchema(coursesTable, { slug }).omit({ id: true, createdAt: true, updatedAt: true });
export const groupInput = createInsertSchema(topicGroupsTable, {
  topics: z.array(z.object({ title: z.string().min(1), stationSlug: z.string().optional() })),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const stationInput = createInsertSchema(stationsTable, { slug, content: stationContentSchema }).omit({ id: true, createdAt: true, updatedAt: true });

export type Course = typeof coursesTable.$inferSelect;
export type TopicGroup = typeof topicGroupsTable.$inferSelect;
export type Station = typeof stationsTable.$inferSelect;
