import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = path.resolve(SCRIPT_DIR, "..");
const COMPOSE_PROJECT = process.env.PUBSUB_COMPOSE_PROJECT ?? "protoutil-pubsub-test";
const DEFAULT_VITEST_ARGS = [
  "--exclude",
  "src/**/load-test.spec.ts",
  "--exclude",
  "src/**/benchmark.spec.ts",
];

async function runCommand(command, args, extraEnv = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: PACKAGE_DIR,
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
  const vitestArgs = process.argv.slice(2);
  await runCommand("docker", ["compose", "-p", COMPOSE_PROJECT, "up", "-d", "--wait"]);

  let testError;
  try {
    await runCommand(
      "pnpm",
      ["exec", "vitest", "run", ...(vitestArgs.length ? vitestArgs : DEFAULT_VITEST_ARGS)],
      {
        KAFKA_COMPOSE_PROJECT: COMPOSE_PROJECT,
        KAFKA_BOOTSTRAP_SERVER: "localhost:19092",
        RABBITMQ_URL: "amqp://guest:guest@127.0.0.1:5673",
      },
    );
  } catch (error) {
    testError = error;
  } finally {
    try {
      await runCommand("docker", ["compose", "-p", COMPOSE_PROJECT, "down"]);
    } catch (cleanupError) {
      if (testError == null) {
        // biome-ignore lint/correctness/noUnsafeFinally: literally doesn't matter
        throw cleanupError;
      }
      // biome-ignore lint/correctness/noUnsafeFinally: literally doesn't matter
      throw new AggregateError(
        [testError, cleanupError],
        "Pubsub tests failed and docker compose cleanup also failed.",
      );
    }
  }

  if (testError != null) {
    throw testError;
  }
}

await main();
