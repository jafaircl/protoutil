# protoutil

TypeScript utilities for working with Protocol Buffers and [Google API Improvement Proposals](https://aip.dev/) (AIP).

## Packages

| Package | Description |
|---------|-------------|
| [@protoutil/core](packages/core/README.md) | Protobuf utilities — checksum, fields, FieldMask, Duration, Timestamp, integer validators |
| [@protoutil/aip](packages/aip/README.md) | AIP implementation — filtering, pagination, ordering, resource names, field behavior, etag, errors |
| [@protoutil/aipql](packages/aipql/README.md) | Translate AIP-160 filter expressions into SQL (PostgreSQL, MySQL, SQLite) or MongoDB queries |
| [@protoutil/repo](packages/repo/README.md) | Database-agnostic protobuf resource persistence using AIP patterns (SQLite, Postgres, MySQL, MongoDB) |
| [@protoutil/angular](packages/angular/README.md) | Angular components and validators for AIP filter editing and protovalidate integration |
| [@protoutil/protoc-gen-sql](packages/protoc-gen-sql/README.md) | Protoc plugin that generates SQL schema and CRUD queries from annotated protobuf definitions |

## License

MIT
