import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.resolve(ROOT, "data", "library.db");

const db = new Database(DB_PATH);
db.pragma("foreign_keys = ON");

// Clear existing data
db.exec(`
  DELETE FROM library_v1_book;
  DELETE FROM library_v1_shelf;
`);

// Seed shelves
const insertShelf = db.prepare(`
  INSERT INTO library_v1_shelf (id, name, theme)
  VALUES (@id, @name, @theme)
`);

const shelves = [
  { id: 1, name: "shelves/1", theme: "Science Fiction" },
  { id: 2, name: "shelves/2", theme: "Fantasy" },
  { id: 3, name: "shelves/3", theme: "History" },
];

for (const shelf of shelves) {
  insertShelf.run(shelf);
}

// Seed books
const insertBook = db.prepare(`
  INSERT INTO library_v1_book (id, shelf_id, name, author, title, read)
  VALUES (@id, @shelfId, @name, @author, @title, @read)
`);

const books = [
  { id: 1, shelfId: 1, name: "shelves/1/books/1", author: "Frank Herbert", title: "Dune", read: 1 },
  {
    id: 2,
    shelfId: 1,
    name: "shelves/1/books/2",
    author: "Isaac Asimov",
    title: "Foundation",
    read: 1,
  },
  {
    id: 3,
    shelfId: 1,
    name: "shelves/1/books/3",
    author: "William Gibson",
    title: "Neuromancer",
    read: 0,
  },
  {
    id: 4,
    shelfId: 2,
    name: "shelves/2/books/4",
    author: "J.R.R. Tolkien",
    title: "The Fellowship of the Ring",
    read: 1,
  },
  {
    id: 5,
    shelfId: 2,
    name: "shelves/2/books/5",
    author: "Ursula K. Le Guin",
    title: "A Wizard of Earthsea",
    read: 0,
  },
  {
    id: 6,
    shelfId: 2,
    name: "shelves/2/books/6",
    author: "Patrick Rothfuss",
    title: "The Name of the Wind",
    read: 1,
  },
  {
    id: 7,
    shelfId: 3,
    name: "shelves/3/books/7",
    author: "Yuval Noah Harari",
    title: "Sapiens",
    read: 1,
  },
  {
    id: 8,
    shelfId: 3,
    name: "shelves/3/books/8",
    author: "Barbara Tuchman",
    title: "The Guns of August",
    read: 0,
  },
  {
    id: 9,
    shelfId: 3,
    name: "shelves/3/books/9",
    author: "Howard Zinn",
    title: "A People's History of the US",
    read: 0,
  },
];

for (const book of books) {
  insertBook.run(book);
}

db.close();

console.log(`✓ Seeded ${shelves.length} shelves and ${books.length} books into ${DB_PATH}`);
