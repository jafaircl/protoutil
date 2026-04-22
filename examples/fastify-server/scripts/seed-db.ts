#!/usr/bin/env tsx
/**
 * Seed the Library API databases using @protoutil/repo.
 *
 * This script demonstrates that repo.create() works identically
 * for both Postgres (shelves) and MongoDB (books) — the same API,
 * different backends.
 */
import { randomUUID } from "node:crypto";
import { getResourceNamePatterns, print, scan } from "@protoutil/aip/resourcename";
import { MongoClient } from "mongodb";
import pg from "pg";
import { closeEngines } from "../src/engines.js";
import { BookSchema, ShelfSchema } from "../src/gen/library/v1/library_pb.js";
import { bookRepo, shelfRepo } from "../src/repositories.js";

const SHELF_PATTERN = getResourceNamePatterns(ShelfSchema)![0];
const BOOK_PATTERN = getResourceNamePatterns(BookSchema)![0];

// Clear existing data so the script is idempotent.
// Use raw clients since engine.execute() isn't designed for DDL/admin ops.
const pgPool = new pg.Pool({
  connectionString:
    process.env.POSTGRES_URL ?? "postgresql://library:library@localhost:5433/library",
});
await pgPool.query("DELETE FROM library_v1_book");
await pgPool.query("DELETE FROM library_v1_shelf");
await pgPool.end();

const mongoClient = new MongoClient(process.env.MONGODB_URI ?? "mongodb://localhost:27018");
await mongoClient.connect();
const db = mongoClient.db(process.env.MONGODB_DATABASE ?? "library");
await db.collection("library_v1_book").deleteMany({});
await mongoClient.close();

// --- Seed shelves (Postgres) ---

const shelfThemes = ["Science Fiction", "Fantasy", "History"];
const shelfNames: string[] = [];

for (const theme of shelfThemes) {
  const name = print(SHELF_PATTERN, { shelf_id: randomUUID() });
  shelfNames.push(name);
  await shelfRepo.create({ name, theme });
}
console.log(`Seeded ${shelfThemes.length} shelves (Postgres)`);

// --- Seed books (MongoDB) ---

const bookData = [
  // Science Fiction
  { shelfIdx: 0, author: "Frank Herbert", title: "Dune", read: true },
  { shelfIdx: 0, author: "Isaac Asimov", title: "Foundation", read: true },
  { shelfIdx: 0, author: "William Gibson", title: "Neuromancer", read: false },
  // Fantasy
  { shelfIdx: 1, author: "J.R.R. Tolkien", title: "The Fellowship of the Ring", read: true },
  { shelfIdx: 1, author: "Ursula K. Le Guin", title: "A Wizard of Earthsea", read: false },
  { shelfIdx: 1, author: "Patrick Rothfuss", title: "The Name of the Wind", read: true },
  // History
  { shelfIdx: 2, author: "Yuval Noah Harari", title: "Sapiens", read: true },
  { shelfIdx: 2, author: "Barbara Tuchman", title: "The Guns of August", read: false },
  { shelfIdx: 2, author: "Howard Zinn", title: "A People's History of the US", read: false },
];

for (const { shelfIdx, ...fields } of bookData) {
  const { shelf_id } = scan(shelfNames[shelfIdx], SHELF_PATTERN);
  const name = print(BOOK_PATTERN, { shelf: shelf_id, book: randomUUID() });
  await bookRepo.create({ name, ...fields });
}
console.log(`Seeded ${bookData.length} books (MongoDB)`);

await closeEngines();
