import { pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectName: varchar("project_name", { length: 255 }).notNull(),
  gitUrl: text("git_url").notNull(),
  status: varchar("status", { length: 50 })
    .$type<"PENDING" | "BUILDING" | "RUNNING" | "FAILED">()
    .default("PENDING"),
  imageTag: varchar("image_tag", { length: 255 }),
  containerId: varchar("container_id", { length: 255 }),
  internalIp: varchar("internal_ip", { length: 50 }),
  url: text("url"),
  createdAt: timestamp("created_at").defaultNow(),
});
