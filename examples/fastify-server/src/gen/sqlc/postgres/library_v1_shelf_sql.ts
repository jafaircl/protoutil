import { QueryArrayConfig, QueryArrayResult } from "pg";

interface Client {
    query: (config: QueryArrayConfig) => Promise<QueryArrayResult>;
}

export const getLibraryV1ShelfQuery = `-- name: GetLibraryV1Shelf :one

SELECT "id", "name", "theme", "created_at", "updated_at"
FROM "library_v1_shelf"
WHERE "id" = $1
LIMIT 1`;

export interface GetLibraryV1ShelfArgs {
    id: string;
}

export interface GetLibraryV1ShelfRow {
    id: string;
    name: string;
    theme: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLibraryV1Shelf(client: Client, args: GetLibraryV1ShelfArgs): Promise<GetLibraryV1ShelfRow | null> {
    const result = await client.query({
        text: getLibraryV1ShelfQuery,
        values: [args.id],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        name: row[1],
        theme: row[2],
        createdAt: row[3],
        updatedAt: row[4]
    };
}

export const listLibraryV1ShelfQuery = `-- name: ListLibraryV1Shelf :many
SELECT "id", "name", "theme", "created_at", "updated_at"
FROM "library_v1_shelf"
ORDER BY "id"`;

export interface ListLibraryV1ShelfRow {
    id: string;
    name: string;
    theme: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLibraryV1Shelf(client: Client): Promise<ListLibraryV1ShelfRow[]> {
    const result = await client.query({
        text: listLibraryV1ShelfQuery,
        values: [],
        rowMode: "array"
    });
    return result.rows.map(row => {
        return {
            id: row[0],
            name: row[1],
            theme: row[2],
            createdAt: row[3],
            updatedAt: row[4]
        };
    });
}

export const createLibraryV1ShelfQuery = `-- name: CreateLibraryV1Shelf :one
INSERT INTO "library_v1_shelf" ("name", "theme")
VALUES ($1, $2)
RETURNING id, name, theme, created_at, updated_at`;

export interface CreateLibraryV1ShelfArgs {
    name: string;
    theme: string;
}

export interface CreateLibraryV1ShelfRow {
    id: string;
    name: string;
    theme: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createLibraryV1Shelf(client: Client, args: CreateLibraryV1ShelfArgs): Promise<CreateLibraryV1ShelfRow | null> {
    const result = await client.query({
        text: createLibraryV1ShelfQuery,
        values: [args.name, args.theme],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        name: row[1],
        theme: row[2],
        createdAt: row[3],
        updatedAt: row[4]
    };
}

export const updateLibraryV1ShelfQuery = `-- name: UpdateLibraryV1Shelf :one
UPDATE "library_v1_shelf"
SET
    "name" = $1,
    "theme" = $2,
    "updated_at" = now()
WHERE "id" = $3
RETURNING id, name, theme, created_at, updated_at`;

export interface UpdateLibraryV1ShelfArgs {
    name: string;
    theme: string;
    id: string;
}

export interface UpdateLibraryV1ShelfRow {
    id: string;
    name: string;
    theme: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateLibraryV1Shelf(client: Client, args: UpdateLibraryV1ShelfArgs): Promise<UpdateLibraryV1ShelfRow | null> {
    const result = await client.query({
        text: updateLibraryV1ShelfQuery,
        values: [args.name, args.theme, args.id],
        rowMode: "array"
    });
    if (result.rows.length !== 1) {
        return null;
    }
    const row = result.rows[0];
    return {
        id: row[0],
        name: row[1],
        theme: row[2],
        createdAt: row[3],
        updatedAt: row[4]
    };
}

export const deleteLibraryV1ShelfQuery = `-- name: DeleteLibraryV1Shelf :exec
DELETE FROM "library_v1_shelf"
WHERE "id" = $1`;

export interface DeleteLibraryV1ShelfArgs {
    id: string;
}

export async function deleteLibraryV1Shelf(client: Client, args: DeleteLibraryV1ShelfArgs): Promise<void> {
    await client.query({
        text: deleteLibraryV1ShelfQuery,
        values: [args.id],
        rowMode: "array"
    });
}

