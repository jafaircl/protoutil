import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const getLibraryV1BookQuery = `-- name: GetLibraryV1Book :one

SELECT "id", "shelf_id", "name", "author", "title", "read", "created_at", "updated_at"
FROM "library_v1_book"
WHERE "id" = $1
LIMIT 1`;

export interface GetLibraryV1BookArgs {
    id: string;
}

export interface GetLibraryV1BookRow {
    id: string;
    shelfId: string;
    name: string;
    author: string;
    title: string;
    read: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLibraryV1Book(client: Client, args: GetLibraryV1BookArgs): Promise<GetLibraryV1BookRow | null> {
    const result = await client.query({
        text: getLibraryV1BookQuery,
        values: [args.id],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        shelfId: row[1],
        name: row[2],
        author: row[3],
        title: row[4],
        read: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const listLibraryV1BookQuery = `-- name: ListLibraryV1Book :many
SELECT "id", "shelf_id", "name", "author", "title", "read", "created_at", "updated_at"
FROM "library_v1_book"
ORDER BY "id"`;

export interface ListLibraryV1BookRow {
    id: string;
    shelfId: string;
    name: string;
    author: string;
    title: string;
    read: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLibraryV1Book(client: Client): Promise<ListLibraryV1BookRow[]> {
    const result = await client.query({
        text: listLibraryV1BookQuery,
        values: [],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            shelfId: row[1],
            name: row[2],
            author: row[3],
            title: row[4],
            read: row[5],
            createdAt: row[6],
            updatedAt: row[7]
        };
    });
}

export const createLibraryV1BookQuery = `-- name: CreateLibraryV1Book :one
INSERT INTO "library_v1_book" ("shelf_id", "name", "author", "title", "read")
VALUES ($1, $2, $3, $4, $5)
RETURNING id, shelf_id, name, author, title, read, created_at, updated_at`;

export interface CreateLibraryV1BookArgs {
    shelfId: string;
    name: string;
    author: string;
    title: string;
    read: boolean;
}

export interface CreateLibraryV1BookRow {
    id: string;
    shelfId: string;
    name: string;
    author: string;
    title: string;
    read: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function createLibraryV1Book(client: Client, args: CreateLibraryV1BookArgs): Promise<CreateLibraryV1BookRow | null> {
    const result = await client.query({
        text: createLibraryV1BookQuery,
        values: [args.shelfId, args.name, args.author, args.title, args.read],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        shelfId: row[1],
        name: row[2],
        author: row[3],
        title: row[4],
        read: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const updateLibraryV1BookQuery = `-- name: UpdateLibraryV1Book :one
UPDATE "library_v1_book"
SET
    "shelf_id" = $1,
    "name" = $2,
    "author" = $3,
    "title" = $4,
    "read" = $5,
    "updated_at" = now()
WHERE "id" = $6
RETURNING id, shelf_id, name, author, title, read, created_at, updated_at`;

export interface UpdateLibraryV1BookArgs {
    shelfId: string;
    name: string;
    author: string;
    title: string;
    read: boolean;
    id: string;
}

export interface UpdateLibraryV1BookRow {
    id: string;
    shelfId: string;
    name: string;
    author: string;
    title: string;
    read: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateLibraryV1Book(client: Client, args: UpdateLibraryV1BookArgs): Promise<UpdateLibraryV1BookRow | null> {
    const result = await client.query({
        text: updateLibraryV1BookQuery,
        values: [args.shelfId, args.name, args.author, args.title, args.read, args.id],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        shelfId: row[1],
        name: row[2],
        author: row[3],
        title: row[4],
        read: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const deleteLibraryV1BookQuery = `-- name: DeleteLibraryV1Book :exec
DELETE FROM "library_v1_book"
WHERE "id" = $1`;

export interface DeleteLibraryV1BookArgs {
    id: string;
}

export async function deleteLibraryV1Book(client: Client, args: DeleteLibraryV1BookArgs): Promise<void> {
    await client.query({
        text: deleteLibraryV1BookQuery,
        values: [args.id],
        rowMode: "array"
    });
}

