import { deployments, projects } from "@/database/schema";
import { type InferSelectModel, type InferInsertModel } from "drizzle-orm";

// For the Project model
export type Project = InferSelectModel<typeof projects>;
export type NewProject = InferInsertModel<typeof projects>;

// For the Deployment model
export type Deployment = InferSelectModel<typeof deployments>;
export type NewDeployment = InferInsertModel<typeof deployments>;
