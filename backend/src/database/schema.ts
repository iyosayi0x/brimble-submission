import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * parent project
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug").unique().notNull(),
  gitUrl: text("git_url").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

/**
 * individual project deployment
 */
export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    status: varchar("status", { length: 50 })
      .$type<"PENDING" | "BUILDING" | "RUNNING" | "FAILED">()
      .default("PENDING"),
    imageTag: varchar("image_tag", { length: 255 }),
    containerId: varchar("container_id", { length: 255 }),
    internalIp: varchar("internal_ip", { length: 50 }),
    url: text("url"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    // Composite index: Ensure version 1 of project A is unique
    uniqueIndex("project_version_idx").on(table.projectId, table.versionNumber),
    index("project_idx").on(table.projectId),
  ],
);
