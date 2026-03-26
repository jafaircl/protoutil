#!/usr/bin/env tsx
/**
 * Initialize databases for the Library API.
 *
 * - Postgres: creates the library_v1_shelf table from the generated schema
 * - MongoDB: creates a unique index on `name` for the library_v1_book collection
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// --- Postgres: create shelf table ---

const pgPool = new pg.Pool({
  connectionString:
    process.env.POSTGRES_URL ?? "postgresql://library:library@localhost:5432/library",
});

// Run the full generated Postgres schema (shelves + books tables)
const schemaPath = path.join(ROOT, "src", "gen", "postgres", "schema.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf-8");

await pgPool.query(schemaSql);
await pgPool.end();
console.log("Postgres: schema ready");

// --- MongoDB: create indexes ---

const mongoClient = new MongoClient(
  process.env.MONGODB_URI ?? "mongodb://localhost:27017",
);

await mongoClient.connect();
const db = mongoClient.db(process.env.MONGODB_DATABASE ?? "library");
await db.collection("library_v1_book").createIndex({ name: 1 }, { unique: true });
await mongoClient.close();
console.log("MongoDB: library_v1_book index ready");
