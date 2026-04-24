type TransactionClient = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof import("../database/schema"),
  ExtractTablesWithRelations<typeof import("../database/schema")>
>;
