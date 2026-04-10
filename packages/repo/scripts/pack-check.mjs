import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(SCRIPT_DIR, "..");
const WORKSPACE_DIR = path.resolve(REPO_DIR, "..", "..");

const PACKAGE_FIXTURES = [
  { name: "@protoutil/core", dir: path.join(WORKSPACE_DIR, "packages", "core") },
  { name: "@protoutil/aip", dir: path.join(WORKSPACE_DIR, "packages", "aip") },
  { name: "@protoutil/aipql", dir: path.join(WORKSPACE_DIR, "packages", "aipql") },
  { name: "@protoutil/repo", dir: REPO_DIR },
];

async function packPackage(pkg, tarballsDir) {
  const { stdout } = await run("pnpm", ["pack", "--pack-destination", tarballsDir], {
    cwd: pkg.dir,
  });
  const filename = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!filename) {
    throw new Error(`Failed to determine packed tarball name for ${pkg.name}.`);
  }

  return path.isAbsolute(filename) ? filename : path.join(tarballsDir, filename);
}

async function findInstalledDependency(pkgDir, dependency) {
  const candidates = [
    path.join(pkgDir, "node_modules", dependency),
    path.join(WORKSPACE_DIR, "node_modules", dependency),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }

  return undefined;
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "protoutil-repo-pack-check-"));
  const tarballsDir = path.join(tempRoot, "tarballs");
  const fixtureDir = path.join(tempRoot, "fixture");
  const nodeModulesDir = path.join(fixtureDir, "node_modules");

  try {
    await mkdir(tarballsDir, { recursive: true });
    await mkdir(fixtureDir, { recursive: true });
    await mkdir(nodeModulesDir, { recursive: true });

    const tarballs = [];
    for (const pkg of PACKAGE_FIXTURES) {
      tarballs.push(await packPackage(pkg, tarballsDir));
    }

    await writeFile(
      path.join(fixtureDir, "package.json"),
      `${JSON.stringify(
        {
          name: "repo-pack-check",
          private: true,
          type: "module",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const protoutilScopeDir = path.join(nodeModulesDir, "@protoutil");
    await mkdir(protoutilScopeDir, { recursive: true });

    for (const [index, pkg] of PACKAGE_FIXTURES.entries()) {
      const extractDir = path.join(tempRoot, "extract", `${index}`);
      await mkdir(extractDir, { recursive: true });
      await run("tar", ["-xzf", tarballs[index], "-C", extractDir]);
      const packageDir = path.join(extractDir, "package");
      const targetDir = path.join(protoutilScopeDir, pkg.name.split("/")[1]);
      await rename(packageDir, targetDir);
    }

    const workspaceNodeModulesDir = path.join(WORKSPACE_DIR, "node_modules");
    const externalLinks = await readdir(workspaceNodeModulesDir);
    for (const dep of externalLinks) {
      if (dep === "@protoutil" || dep === ".bin" || dep.startsWith(".")) {
        continue;
      }
      const source = path.join(workspaceNodeModulesDir, dep);
      const target = path.join(nodeModulesDir, dep);
      await symlink(source, target);
    }

    for (const pkg of PACKAGE_FIXTURES) {
      const packageJson = JSON.parse(await readFile(path.join(pkg.dir, "package.json"), "utf8"));
      const dependencies = Object.keys(packageJson.dependencies ?? {}).filter(
        (dependency) => !dependency.startsWith("@protoutil/"),
      );

      for (const dependency of dependencies) {
        const source = await findInstalledDependency(pkg.dir, dependency);
        if (!source) {
          continue;
        }

        const target = path.join(nodeModulesDir, dependency);
        await mkdir(path.dirname(target), { recursive: true });
        try {
          await symlink(source, target);
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
            throw error;
          }
        }
      }
    }

    await writeFile(
      path.join(fixtureDir, "smoke.mjs"),
      `import * as repo from "@protoutil/repo";
import * as sqlite from "@protoutil/repo/sqlite";
import * as postgres from "@protoutil/repo/postgres";
import * as mysql from "@protoutil/repo/mysql";
import * as mongodb from "@protoutil/repo/mongodb";

const checks = [
  ["createRepository", typeof repo.createRepository === "function"],
  ["buildFilter", typeof repo.buildFilter === "function"],
  ["serializeMessage", typeof repo.serializeMessage === "function"],
  ["createSQLiteEngine", typeof sqlite.createSQLiteEngine === "function"],
  ["createPostgresEngine", typeof postgres.createPostgresEngine === "function"],
  ["createMySQLEngine", typeof mysql.createMySQLEngine === "function"],
  ["createMongoDBEngine", typeof mongodb.createMongoDBEngine === "function"],
];

const failures = checks.filter(([, ok]) => !ok);
if (failures.length > 0) {
  throw new Error(\`Missing expected exports: \${failures.map(([name]) => name).join(", ")}\`);
}
`,
      "utf8",
    );

    await writeFile(
      path.join(fixtureDir, "smoke.cjs"),
      `const repo = require("@protoutil/repo");
const sqlite = require("@protoutil/repo/sqlite");
const postgres = require("@protoutil/repo/postgres");
const mysql = require("@protoutil/repo/mysql");
const mongodb = require("@protoutil/repo/mongodb");

const checks = [
  ["createRepository", typeof repo.createRepository === "function"],
  ["buildFilter", typeof repo.buildFilter === "function"],
  ["serializeMessage", typeof repo.serializeMessage === "function"],
  ["createSQLiteEngine", typeof sqlite.createSQLiteEngine === "function"],
  ["createPostgresEngine", typeof postgres.createPostgresEngine === "function"],
  ["createMySQLEngine", typeof mysql.createMySQLEngine === "function"],
  ["createMongoDBEngine", typeof mongodb.createMongoDBEngine === "function"],
];

const failures = checks.filter(([, ok]) => !ok);
if (failures.length > 0) {
  throw new Error(\`Missing expected exports: \${failures.map(([name]) => name).join(", ")}\`);
}
`,
      "utf8",
    );

    await run("node", ["smoke.mjs"], { cwd: fixtureDir });
    await run("node", ["smoke.cjs"], { cwd: fixtureDir });

    console.log("Pack check passed.");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await main();
