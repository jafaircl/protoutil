import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(SCRIPT_DIR, "..");
const COMPOSE_PROJECT = "protoutil-repo-test";
const TEST_ENV = {
  PGHOST: "127.0.0.1",
  PGPORT: "5434",
  MYSQL_HOST: "127.0.0.1",
  MYSQL_PORT: "3307",
  MONGODB_URI: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
};

async function runCommand(command, args, extraEnv) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_DIR,
      env: { ...process.env, ...extraEnv },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal == null
            ? `${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`
            : `${command} ${args.join(" ")} exited with signal ${signal}`,
        ),
      );
    });
  });
}

async function main() {
  await runCommand("docker", ["compose", "-p", COMPOSE_PROJECT, "up", "-d", "--wait"]);

  let testError;
  try {
    await runCommand("pnpm", ["run", "test:vitest"], TEST_ENV);
  } catch (error) {
    testError = error;
  } finally {
    try {
      await runCommand("docker", ["compose", "-p", COMPOSE_PROJECT, "down"]);
    } catch (cleanupError) {
      if (testError == null) {
        // biome-ignore lint/correctness/noUnsafeFinally: should throw
        throw cleanupError;
      }

      // biome-ignore lint/correctness/noUnsafeFinally: should throw
      throw new AggregateError(
        [testError, cleanupError],
        "Repo tests failed and docker compose cleanup also failed.",
      );
    }
  }

  if (testError != null) {
    throw testError;
  }
}

await main();
