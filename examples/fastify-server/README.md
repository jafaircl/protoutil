# Library API — Fastify + ConnectRPC Example

A demo API server that showcases how `@protoutil/repo`, `@protoutil/aip`, and the [Buf](https://buf.build) ecosystem work together to build a production-ready gRPC/Connect API with minimal boilerplate.

## What This Demonstrates

- **Database-agnostic repositories** — Shelves are stored in **Postgres**, Books in **MongoDB**. The application code is identical for both; only the engine configuration differs.
- **AIP-compliant resource names** — Resource name patterns are read directly from protobuf `google.api.resource` annotations. IDs are UUIDs.
- **Filtering, pagination, and ordering** — List RPCs support AIP-160 filtering, page tokens, and `order_by` out of the box.
- **Field mask updates** — `UpdateBook` passes `update_mask` through to the repository.
- **Request validation** — All requests are validated with [`@bufbuild/protovalidate`](https://github.com/bufbuild/protovalidate).
- **Interceptors** — Logging interceptors on both the ConnectRPC and repository layers show request timing.

## Prerequisites

- [Node.js](https://nodejs.org) v20+
- [Docker](https://www.docker.com)
- [moonrepo](https://moonrepo.dev) (`moon` CLI)

## Quick Start

From the repository root:

```sh
moon run fastify-server:dev
```

This single command will:

1. Start Postgres and MongoDB via Docker Compose
2. Generate protobuf code (`buf generate`)
3. Initialize database schemas and indexes
4. Seed sample data (3 shelves, 9 books)
5. Start the dev server on **http://localhost:8080**

The example databases bind to `localhost:5433` and `localhost:27018` by default so they do not collide with the `@protoutil/repo` test stack. Its RabbitMQ broker binds to `localhost:5675` (`15675` for the management UI) so it can also run beside the `@protoutil/pubsub` conformance and benchmark stack.

## Available RPCs

The server implements 9 of the 11 `LibraryService` RPCs defined in [`examples/proto/library/v1/library.proto`](../proto/library/v1/library.proto):

| RPC | Backend | Description |
|-----|---------|-------------|
| `CreateShelf` | Postgres | Create a shelf with a generated resource name |
| `GetShelf` | Postgres | Fetch a shelf by resource name |
| `ListShelves` | Postgres | List shelves with filtering, pagination, ordering |
| `DeleteShelf` | Postgres | Delete a shelf and its books |
| `CreateBook` | MongoDB | Create a book under a parent shelf |
| `GetBook` | MongoDB | Fetch a book by resource name |
| `ListBooks` | MongoDB | List books scoped to a parent shelf |
| `UpdateBook` | MongoDB | Update book fields via field mask |
| `DeleteBook` | MongoDB | Delete a book by resource name |

`MergeShelves` and `MoveBook` are not yet implemented.

## Testing with curl

The server speaks the [Connect protocol](https://connectrpc.com/docs/protocol), so you can call RPCs with plain HTTP:

```sh
# List all shelves
curl -X POST http://localhost:8080/library.v1.LibraryService/ListShelves \
  -H 'Content-Type: application/json' \
  -d '{}'

# Create a shelf
curl -X POST http://localhost:8080/library.v1.LibraryService/CreateShelf \
  -H 'Content-Type: application/json' \
  -d '{"shelf": {"theme": "Philosophy"}}'

# List books on a shelf (replace with a real shelf name from ListShelves)
curl -X POST http://localhost:8080/library.v1.LibraryService/ListBooks \
  -H 'Content-Type: application/json' \
  -d '{"parent": "shelves/<shelf-uuid>"}'
```

## Project Structure

```
├── docker-compose.yml        # Postgres + MongoDB
├── scripts/
│   ├── init-db.ts            # Schema creation and index setup
│   └── seed-db.ts            # Sample data using repo.create()
├── src/
│   ├── engines.ts            # Postgres and MongoDB engine setup
│   ├── repositories.ts       # Repository definitions + logging interceptor
│   ├── connect.ts            # All 9 RPC implementations
│   ├── app.ts                # Fastify app with ConnectRPC plugin
│   └── server.ts             # Server entry point with graceful shutdown
└── moon.yml                  # Task orchestration
```

## Moon Tasks

| Task | Description |
|------|-------------|
| `moon run fastify-server:dev` | Start everything (databases, init, seed, server) |
| `moon run fastify-server:db` | Start database containers only |
| `moon run fastify-server:dbgen` | Initialize schemas and indexes |
| `moon run fastify-server:dbseed` | Seed sample data |
| `moon run fastify-server:protogen` | Regenerate protobuf code |
| `moon run fastify-server:typecheck` | Run TypeScript type checking |
| `moon run fastify-server:build` | Production build |

## Key Packages Used

- [`@protoutil/repo`](../../packages/repo) — Database-agnostic protobuf repositories
- [`@protoutil/aip`](../../packages/aip) — AIP resource names, pagination, filtering, errors
- [`@protoutil/core`](../../packages/core) — Protobuf utilities (field masks, timestamps, etc.)
- [`@bufbuild/protovalidate`](https://github.com/bufbuild/protovalidate) — Request validation from proto constraints
- [`@connectrpc/connect-fastify`](https://connectrpc.com) — ConnectRPC integration for Fastify
