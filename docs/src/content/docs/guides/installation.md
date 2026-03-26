---
title: Installation
description: How to install protoutil packages
---

All protoutil packages are published to npm. Install only the packages you need.

## Prerequisites

- Node.js 22 or later
- A package manager: npm, pnpm, or yarn

## Buf Registry

Some packages depend on generated protobuf types from the [Buf Schema Registry](https://buf.build/). You need to configure your package manager to resolve `@buf` scoped packages:

```bash
# npm
npm config set @buf:registry https://buf.build/gen/npm/v1/

# pnpm
pnpm config set @buf:registry https://buf.build/gen/npm/v1/

# yarn
yarn config set npmScopes.buf.npmRegistryServer https://buf.build/gen/npm/v1/
```

Or add to your `.npmrc`:

```ini
@buf:registry=https://buf.build/gen/npm/v1/
```

## Install Packages

```bash
# Core utilities
npm install @protoutil/core

# AIP SDK (includes core as a dependency)
npm install @protoutil/aip

# AIP-160 to SQL/MongoDB translation
npm install @protoutil/aipql

# Database repository layer
npm install @protoutil/repo

# Angular components
npm install @protoutil/angular

# Protoc SQL plugin (global install)
npm install -g @protoutil/protoc-gen-sql
```

## Database Drivers

If using `@protoutil/repo`, install the driver for your database:

```bash
# SQLite
npm install better-sqlite3

# Postgres
npm install pg

# MySQL
npm install mysql2

# MongoDB
npm install mongodb
```
