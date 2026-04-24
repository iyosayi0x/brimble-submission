import CONFIGS from "@/config";
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";

const db = drizzle(CONFIGS.DATABASE_URL);

export default db;
