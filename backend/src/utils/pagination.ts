import db from "@/database";
import CustomError from "./custom-error";
import { and, desc, lt, or, eq, type SQL } from "drizzle-orm";

/**
 * A generic cursor pagination utility for Drizzle Relational API
 */
export default async function cursorPaginate<
  T extends "projects" | "deployments",
>(
  model: T,
  options: {
    cursor?: string;
    limit?: number;
    where?: SQL;
  },
) {
  const { cursor, limit = 10, where: extraFilters } = options;
  const table = (db.query as any)[model];

  if (!table) throw new CustomError(`Model ${model} not found in schema`);

  /**
   * 1. Decode Cursor: "timestamp_uuid"
   */
  let cursorCondition: SQL | undefined;
  if (cursor) {
    const [createdAtStr, id] = cursor.split("_");
    const createdAt = new Date(parseInt(createdAtStr));

    if (isNaN(createdAt.getTime()) || !id) {
      throw new CustomError("Invalid pagination cursor");
    }

    // Reference the specific table columns dynamically
    const schemaTable = (db as any)._.fullSchema[model];

    cursorCondition = or(
      lt(schemaTable.createdAt, createdAt),
      and(eq(schemaTable.createdAt, createdAt), lt(schemaTable.id, id)),
    );
  }

  /**
   * 2. Perform Query
   */
  const data = await table.findMany({
    where: extraFilters
      ? cursorCondition
        ? and(extraFilters, cursorCondition)
        : extraFilters
      : cursorCondition,
    // We sort descending to show newest items first (standard PaaS dashboard)
    orderBy: [
      desc((db as any)._.fullSchema[model].createdAt),
      desc((db as any)._.fullSchema[model].id),
    ],
    limit: limit + 1,
  });

  /**
   * 3. Process Results
   */
  const hasNextPage = data.length > limit;
  const items = hasNextPage ? data.slice(0, -1) : data;

  let nextCursor: string | null = null;
  if (hasNextPage && items.length > 0) {
    const lastItem = items[items.length - 1];
    // Encode: unixTimestamp_uuid
    nextCursor = `${lastItem.createdAt.getTime()}_${lastItem.id}`;
  }

  return {
    items,
    nextCursor,
    hasNextPage,
  };
}
