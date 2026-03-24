import Database from "better-sqlite3";
import type { MongoClient } from "mongodb";
import type { Pool as MySQLPool } from "mysql2/promise";
import mysql from "mysql2/promise";
import { Pool as PostgresPool } from "pg";
import type { Engine } from "./engine.js";
import { createMongoDBEngine } from "./mongodb/engine.js";
import { createMySQLEngine } from "./mysql/engine.js";
import { createPostgresEngine } from "./postgres/engine.js";
import { createSQLiteEngine } from "./sqlite/engine.js";

export interface UserSeed {
  uid: string;
  displayName?: string;
  email: string;
  age?: number;
  active?: boolean;
  etag?: string;
  secret?: string;
  immutableField?: string;
}

export interface MappedUserSeed {
  user_id: string;
  name?: string;
  email_addr: string;
  user_age?: number;
  is_active?: boolean;
  etag?: string;
  secret?: string;
  immutable?: string;
}

export interface RepositoryTestContext {
  engine: Engine;
  cleanup(): Promise<void>;
  insertUsers(users: UserSeed[]): Promise<void>;
  setupMappedUsers(tableName: string, users?: MappedUserSeed[]): Promise<void>;
}

export interface RepositoryTestBackend {
  name: string;
  setupSuite?(): Promise<void>;
  teardownSuite?(): Promise<void>;
  createContext(): Promise<RepositoryTestContext>;
}

const REPO_USERS_TABLE = "repo_users";

function sqliteUsersTable(tableName: string): string {
  return `
  CREATE TABLE IF NOT EXISTS ${tableName} (
    uid TEXT PRIMARY KEY,
    displayName TEXT,
    email TEXT NOT NULL,
    age INTEGER,
    active INTEGER DEFAULT 0,
    etag TEXT,
    secret TEXT,
    immutableField TEXT
  )
`;
}

function postgresUsersTable(tableName: string): string {
  return `
  CREATE TABLE IF NOT EXISTS ${tableName} (
    uid TEXT PRIMARY KEY,
    "displayName" TEXT,
    email TEXT NOT NULL,
    age INTEGER,
    active BOOLEAN DEFAULT FALSE,
    etag TEXT,
    secret TEXT,
    "immutableField" TEXT
  )
`;
}

function mysqlUsersTable(tableName: string): string {
  return `
  CREATE TABLE IF NOT EXISTS ${tableName} (
    uid VARCHAR(255) PRIMARY KEY,
    displayName TEXT,
    email VARCHAR(255) NOT NULL,
    age INT,
    active TINYINT(1) DEFAULT 0,
    etag TEXT,
    secret TEXT,
    immutableField TEXT
  )
`;
}

function sqliteMappedTable(tableName: string): string {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      email_addr TEXT NOT NULL,
      user_age INTEGER,
      is_active INTEGER DEFAULT 0,
      etag TEXT,
      secret TEXT,
      immutable TEXT
    )
  `;
}

function postgresMappedTable(tableName: string): string {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      user_id TEXT PRIMARY KEY,
      name TEXT,
      email_addr TEXT NOT NULL,
      user_age INTEGER,
      is_active BOOLEAN DEFAULT FALSE,
      etag TEXT,
      secret TEXT,
      immutable TEXT
    )
  `;
}

function mysqlMappedTable(tableName: string): string {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      user_id VARCHAR(255) PRIMARY KEY,
      name TEXT,
      email_addr VARCHAR(255) NOT NULL,
      user_age INT,
      is_active TINYINT(1) DEFAULT 0,
      etag TEXT,
      secret TEXT,
      immutable TEXT
    )
  `;
}

function sqlUserParams(user: UserSeed, booleanMode: "number" | "boolean"): unknown[] {
  const active = user.active ?? false;
  return [
    user.uid,
    user.displayName ?? null,
    user.email,
    user.age ?? null,
    booleanMode === "number" ? (active ? 1 : 0) : active,
    user.etag ?? null,
    user.secret ?? null,
    user.immutableField ?? null,
  ];
}

function sqlMappedUserParams(user: MappedUserSeed, booleanMode: "number" | "boolean"): unknown[] {
  const active = user.is_active ?? false;
  return [
    user.user_id,
    user.name ?? null,
    user.email_addr,
    user.user_age ?? null,
    booleanMode === "number" ? (active ? 1 : 0) : active,
    user.etag ?? null,
    user.secret ?? null,
    user.immutable ?? null,
  ];
}

function mongoUserDoc(user: UserSeed): Record<string, unknown> {
  return {
    uid: user.uid,
    ...(user.displayName !== undefined && { displayName: user.displayName }),
    email: user.email,
    ...(user.age !== undefined && { age: user.age }),
    ...(user.active !== undefined && { active: user.active }),
    ...(user.etag !== undefined && { etag: user.etag }),
    ...(user.secret !== undefined && { secret: user.secret }),
    ...(user.immutableField !== undefined && { immutableField: user.immutableField }),
  };
}

function mongoMappedUserDoc(user: MappedUserSeed): Record<string, unknown> {
  return {
    user_id: user.user_id,
    ...(user.name !== undefined && { name: user.name }),
    email_addr: user.email_addr,
    ...(user.user_age !== undefined && { user_age: user.user_age }),
    ...(user.is_active !== undefined && { is_active: user.is_active }),
    ...(user.etag !== undefined && { etag: user.etag }),
    ...(user.secret !== undefined && { secret: user.secret }),
    ...(user.immutable !== undefined && { immutable: user.immutable }),
  };
}

function makeSQLiteBackend(): RepositoryTestBackend {
  return {
    name: "sqlite",
    async createContext(): Promise<RepositoryTestContext> {
      const db = new Database(":memory:");
      const engine = createSQLiteEngine({ client: db });

      return {
        engine,

        async insertUsers(users: UserSeed[]): Promise<void> {
          await engine.execute(sqliteUsersTable(REPO_USERS_TABLE));
          for (const user of users) {
            await engine.execute(
              `INSERT INTO ${REPO_USERS_TABLE} (uid, displayName, email, age, active, etag, secret, immutableField) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              sqlUserParams(user, "number"),
            );
          }
        },

        async setupMappedUsers(tableName: string, users: MappedUserSeed[] = []): Promise<void> {
          await engine.execute(sqliteMappedTable(tableName));
          for (const user of users) {
            await engine.execute(
              `INSERT INTO ${tableName} (user_id, name, email_addr, user_age, is_active, etag, secret, immutable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              sqlMappedUserParams(user, "number"),
            );
          }
        },

        async cleanup(): Promise<void> {
          await engine.close();
        },
      };
    },
  };
}

function makePostgresBackend(): RepositoryTestBackend {
  let pool: PostgresPool;

  return {
    name: "postgres",

    async setupSuite(): Promise<void> {
      pool = new PostgresPool({
        host: process.env.PGHOST ?? "localhost",
        port: parseInt(process.env.PGPORT ?? "5432", 10),
        user: process.env.PGUSER ?? "test",
        password: process.env.PGPASSWORD ?? "test",
        database: process.env.PGDATABASE ?? "test",
      });
    },

    async teardownSuite(): Promise<void> {
      await pool.end();
    },

    async createContext(): Promise<RepositoryTestContext> {
      const engine = createPostgresEngine({ client: pool });

      const cleanup = async () => {
        await pool.query("DROP TABLE IF EXISTS repo_mapped_users2");
        await pool.query("DROP TABLE IF EXISTS repo_mapped_users");
        await pool.query(`DROP TABLE IF EXISTS ${REPO_USERS_TABLE}`);
      };

      await cleanup();

      return {
        engine,

        async insertUsers(users: UserSeed[]): Promise<void> {
          await engine.execute(postgresUsersTable(REPO_USERS_TABLE));
          for (const user of users) {
            await engine.insertOne({
              table: REPO_USERS_TABLE,
              row: {
                uid: user.uid,
                displayName: user.displayName ?? null,
                email: user.email,
                age: user.age ?? null,
                active: user.active ?? false,
                etag: user.etag ?? null,
                secret: user.secret ?? null,
                immutableField: user.immutableField ?? null,
              },
            });
          }
        },

        async setupMappedUsers(tableName: string, users: MappedUserSeed[] = []): Promise<void> {
          await engine.execute(postgresMappedTable(tableName));
          for (const user of users) {
            await engine.execute(
              `INSERT INTO ${tableName} (user_id, name, email_addr, user_age, is_active, etag, secret, immutable) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              sqlMappedUserParams(user, "boolean"),
            );
          }
        },

        cleanup,
      };
    },
  };
}

function makeMySQLBackend(): RepositoryTestBackend {
  let pool: MySQLPool;

  return {
    name: "mysql",

    async setupSuite(): Promise<void> {
      pool = mysql.createPool({
        host: process.env.MYSQL_HOST ?? "localhost",
        port: parseInt(process.env.MYSQL_PORT ?? "3306", 10),
        user: process.env.MYSQL_USER ?? "test",
        password: process.env.MYSQL_PASSWORD ?? "test",
        database: process.env.MYSQL_DATABASE ?? "test",
      });
    },

    async teardownSuite(): Promise<void> {
      await pool.end();
    },

    async createContext(): Promise<RepositoryTestContext> {
      const engine = createMySQLEngine({ client: pool });

      const cleanup = async () => {
        await pool.execute("DROP TABLE IF EXISTS repo_mapped_users2");
        await pool.execute("DROP TABLE IF EXISTS repo_mapped_users");
        await pool.execute(`DROP TABLE IF EXISTS ${REPO_USERS_TABLE}`);
      };

      await cleanup();

      return {
        engine,

        async insertUsers(users: UserSeed[]): Promise<void> {
          await engine.execute(mysqlUsersTable(REPO_USERS_TABLE));
          for (const user of users) {
            await engine.execute(
              `INSERT INTO ${REPO_USERS_TABLE} (uid, displayName, email, age, active, etag, secret, immutableField) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              sqlUserParams(user, "number"),
            );
          }
        },

        async setupMappedUsers(tableName: string, users: MappedUserSeed[] = []): Promise<void> {
          await engine.execute(mysqlMappedTable(tableName));
          for (const user of users) {
            await engine.execute(
              `INSERT INTO ${tableName} (user_id, name, email_addr, user_age, is_active, etag, secret, immutable) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              sqlMappedUserParams(user, "number"),
            );
          }
        },

        cleanup,
      };
    },
  };
}

function makeMongoDBBackend(): RepositoryTestBackend {
  let client: MongoClient;
  const databaseName = process.env.MONGODB_REPOSITORY_DATABASE ?? "test_repo";

  return {
    name: "mongodb",

    async setupSuite(): Promise<void> {
      const { MongoClient } = await import("mongodb");
      client = new MongoClient(
        process.env.MONGODB_URI ?? "mongodb://localhost:27017/?replicaSet=rs0",
      );
      await client.connect();
    },

    async teardownSuite(): Promise<void> {
      await client.close();
    },

    async createContext(): Promise<RepositoryTestContext> {
      await client.db(databaseName).dropDatabase();
      const engine = createMongoDBEngine({ client, database: databaseName });

      return {
        engine,

        async insertUsers(users: UserSeed[]): Promise<void> {
          if (users.length === 0) return;
          await client
            .db(databaseName)
            .collection(REPO_USERS_TABLE)
            .insertMany(users.map(mongoUserDoc));
        },

        async setupMappedUsers(tableName: string, users: MappedUserSeed[] = []): Promise<void> {
          if (users.length === 0) return;
          await client
            .db(databaseName)
            .collection(tableName)
            .insertMany(users.map(mongoMappedUserDoc));
        },

        async cleanup(): Promise<void> {
          await client.db(databaseName).dropDatabase();
        },
      };
    },
  };
}

export const repositoryTestBackends: RepositoryTestBackend[] = [
  makeSQLiteBackend(),
  makePostgresBackend(),
  makeMySQLBackend(),
  makeMongoDBBackend(),
];
