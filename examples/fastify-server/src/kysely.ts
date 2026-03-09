import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "./gen/kysely/sqlite/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const dialect = new SqliteDialect({
  database: new Database(resolve(__dirname, "../data/library.db")),
});

export const db = new Kysely<DB>({ dialect });
