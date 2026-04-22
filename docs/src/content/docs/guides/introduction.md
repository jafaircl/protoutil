---
title: Introduction
description: Overview of the protoutil packages
---

protoutil is a collection of TypeScript packages for working with Protocol Buffers and implementing [Google API Improvement Proposals](https://aip.dev/) (AIP). All packages use [`protobuf-es`](https://github.com/bufbuild/protobuf-es) (v2) as their protobuf runtime.

## Packages

| Package | Description |
|---------|-------------|
| [`@protoutil/core`](/api/core/) | Checksum, field get/set, integer validators, and well-known type utilities (Duration, Timestamp, FieldMask) |
| [`@protoutil/aip`](/api/aip/) | TypeScript SDK for Google AIP: filtering, pagination, resource names, ETags, errors, ordering, and field behavior |
| [`@protoutil/aipql`](/api/aipql/) | Translate AIP-160 filter expressions into SQL (Postgres, MySQL, SQLite) and MongoDB queries |
| [`@protoutil/repo`](/api/repo/) | Database-agnostic protobuf resource persistence using AIP patterns |
| [`@protoutil/angular`](/api/angular/) | Angular components and validators for AIP-160 filter editing and protovalidate |
| [`@protoutil/protoc-gen-sql`](/packages/protoc-gen-sql/) | Protoc plugin for generating SQL schema and CRUD queries from annotated proto definitions |

## Package Dependencies

The packages build on each other:

- **`@protoutil/core`** is the foundation — no dependencies on other protoutil packages
- **`@protoutil/aip`** depends on `core`
- **`@protoutil/aipql`** depends on `aip` and `core`
- **`@protoutil/repo`** depends on `aip`, `aipql`, and `core`
- **`@protoutil/angular`** depends on `aip`
- **`@protoutil/protoc-gen-sql`** depends on `core`
