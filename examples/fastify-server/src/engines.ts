/**
 * Database engines for the Library API.
 *
 * Demonstrates that @protoutil/repo supports multiple database backends
 * behind a single Engine interface. Shelves are stored in Postgres and
 * Books are stored in MongoDB — the repository layer doesn't care.
 */

import { createMongoDBEngine } from "@protoutil/repo/mongodb";
import { createPostgresEngine } from "@protoutil/repo/postgres";
import { MongoClient } from "mongodb";
import pg from "pg";

// --- Postgres (Shelves) ---

const pgPool = new pg.Pool({
  connectionString:
    process.env.POSTGRES_URL ?? "postgresql://library:library@localhost:5432/library",
});

export const postgresEngine = createPostgresEngine({ client: pgPool });

// --- MongoDB (Books) ---

const mongoClient = new MongoClient(
  process.env.MONGODB_URI ?? "mongodb://localhost:27017",
);

await mongoClient.connect();

export const mongoEngine = createMongoDBEngine({
  client: mongoClient,
  database: process.env.MONGODB_DATABASE ?? "library",
});

// --- Graceful shutdown ---

export async function closeEngines() {
  await pgPool.end();
  await mongoClient.close();
}
