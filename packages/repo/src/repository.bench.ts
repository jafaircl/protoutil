import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { resolveColumnMap } from "./columns.js";
import { TestUserSchema } from "./gen/protoutil/repo/v1/test_pb.js";
import { buildFilter, createRepository, deserializeRow, serializeMessage } from "./index.js";
import type { RepositoryTestContext, UserSeed } from "./test-backends.js";
import { repositoryTestBackends } from "./test-backends.js";

type ScaleOperation =
  | "create"
  | "get"
  | "update"
  | "delete"
  | "list"
  | "count"
  | "batchCreate"
  | "batchGet"
  | "batchUpdate"
  | "batchDelete";

type BenchmarkStats = {
  sampleCount: number;
  meanMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  standardDeviationMs: number;
  opsPerSecond: number;
};

type SuccessfulScaleBenchmarkResult = BenchmarkStats & {
  kind: "scale";
  success: true;
  operation: ScaleOperation;
  recordCount: number;
  perRecordMs: number;
  recordsPerSecond: number;
  notes: string;
};

type FailedScaleBenchmarkResult = {
  kind: "scale";
  success: false;
  operation: ScaleOperation;
  recordCount: number;
  notes: string;
  error: string;
};

type ScaleBenchmarkResult = SuccessfulScaleBenchmarkResult | FailedScaleBenchmarkResult;

type UtilityBenchmarkResult = BenchmarkStats & {
  kind: "utility";
  name: string;
  notes: string;
};

type BenchmarkReport = {
  generatedAt: string;
  packageVersion: string;
  environment: {
    node: string;
    platform: string;
    arch: string;
    cpu: string;
    cpuCount: number;
    memoryGb: number;
  };
  methodology: {
    backend: string;
    database: string;
    scales: number[];
    scaleSamples: number;
    scaleWarmups: number;
    utilitySamples: number;
    utilityWarmups: number;
  };
  scaleBenchmarks: ScaleBenchmarkResult[];
  utilityBenchmarks: UtilityBenchmarkResult[];
};

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = path.join(PACKAGE_DIR, "benchmarks");
const RESULTS_PATH = path.join(RESULTS_DIR, "results.json");
const MARKDOWN_PATH = path.join(PACKAGE_DIR, "BENCHMARKS.md");
const DOCS_MARKDOWN_PATH = path.resolve(
  PACKAGE_DIR,
  "../../docs/src/content/docs/packages/repo/benchmarks.md",
);
const TABLE_NAME = "repo_users";
const SCALES = [1, 10, 100, 500] as const;
const SCALE_SAMPLES = 5;
const SCALE_WARMUPS = 1;
const UTILITY_SAMPLES = 25;
const UTILITY_WARMUPS = 3;

const SCALE_OPERATION_NOTES: Record<ScaleOperation, string> = {
  create: "Loops over repo.create on an empty table.",
  get: "Loops over repo.get({ uid }) against pre-seeded rows.",
  update: "Loops over repo.update({ uid }, patch) against pre-seeded rows.",
  delete: "Loops over repo.delete({ uid }) against pre-seeded rows.",
  list: "Calls repo.list once and reads the whole page.",
  count: "Calls repo.count once over the full table.",
  batchCreate: "Calls repo.batchCreate once with the full input set.",
  batchGet: "Calls repo.batchGet once with the full query set.",
  batchUpdate: "Calls repo.batchUpdate once with the full update set.",
  batchDelete: "Calls repo.batchDelete once with the full query set.",
};

const UTILITY_NOTES: Record<string, string> = {
  "buildFilter(partial)": "Converts a partial object into a checked AIP-160 expression.",
  "buildFilter(string)": "Parses and type-checks an AIP-160 filter string.",
  serializeMessage: "Converts a protobuf message into a plain row object.",
  deserializeRow: "Converts a row object back into a protobuf message.",
};

const sqliteBackend = repositoryTestBackends.find((backend) => backend.name === "sqlite");

function getSQLiteBackend() {
  if (!sqliteBackend) {
    throw new Error("SQLite benchmark backend was not found.");
  }
  return sqliteBackend;
}

const defaultColumnMap = resolveColumnMap(TestUserSchema);
const utilityMessage = create(TestUserSchema, makeUser(1));
const utilityRow = { ...serializeMessage(TestUserSchema, utilityMessage), active: 1 };

function makeUser(index: number): MessageInitShape<typeof TestUserSchema> {
  return {
    uid: `u${index}`,
    displayName: `User ${index}`,
    email: `user${index}@example.com`,
    age: 20 + (index % 40),
    active: index % 2 === 0,
    immutableField: `immutable-${index}`,
    secret: `secret-${index}`,
  };
}

function makeUserSeed(index: number): UserSeed {
  const user = makeUser(index);
  return {
    uid: user.uid ?? "",
    displayName: user.displayName,
    email: user.email ?? "",
    age: user.age,
    active: user.active,
    immutableField: user.immutableField,
    secret: user.secret,
  };
}

function makeUsers(count: number, start = 1): MessageInitShape<typeof TestUserSchema>[] {
  return Array.from({ length: count }, (_, index) => makeUser(start + index));
}

function makeUserSeeds(count: number, start = 1): UserSeed[] {
  return Array.from({ length: count }, (_, index) => makeUserSeed(start + index));
}

function createBenchRepository(ctx: RepositoryTestContext) {
  return createRepository(TestUserSchema, {
    engine: ctx.engine,
    tableName: TABLE_NAME,
    pagination: {
      defaultSize: 1000,
      maxSize: 5000,
    },
  });
}

async function createEmptyState() {
  const ctx = await getSQLiteBackend().createContext();
  await ctx.insertUsers([]);
  const repo = createBenchRepository(ctx);
  return { ctx, repo };
}

async function createSeededState(count: number) {
  const ctx = await getSQLiteBackend().createContext();
  const users = makeUserSeeds(count);
  await ctx.insertUsers(users);
  const repo = createBenchRepository(ctx);
  return { ctx, repo, users };
}

async function disposeContext(ctx: RepositoryTestContext) {
  await ctx.cleanup();
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function standardDeviation(values: number[], average: number): number {
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeStats(durationsMs: number[]): BenchmarkStats {
  const meanMs = mean(durationsMs);
  return {
    sampleCount: durationsMs.length,
    meanMs,
    medianMs: median(durationsMs),
    minMs: Math.min(...durationsMs),
    maxMs: Math.max(...durationsMs),
    standardDeviationMs: standardDeviation(durationsMs, meanMs),
    opsPerSecond: 1000 / meanMs,
  };
}

async function measureBenchmark(
  samples: number,
  warmups: number,
  prepare: () => Promise<{
    ctx: RepositoryTestContext;
    run: () => Promise<void>;
  }>,
): Promise<BenchmarkStats> {
  for (let index = 0; index < warmups; index += 1) {
    const state = await prepare();
    try {
      await state.run();
    } finally {
      await disposeContext(state.ctx);
    }
  }

  const durationsMs: number[] = [];

  for (let index = 0; index < samples; index += 1) {
    const state = await prepare();
    try {
      const startedAt = performance.now();
      await state.run();
      durationsMs.push(performance.now() - startedAt);
    } finally {
      await disposeContext(state.ctx);
    }
  }

  return computeStats(durationsMs);
}

async function runScaleBenchmarks(): Promise<ScaleBenchmarkResult[]> {
  const results: ScaleBenchmarkResult[] = [];

  for (const recordCount of SCALES) {
    const queries = Array.from({ length: recordCount }, (_, index) => ({
      uid: `u${index + 1}`,
    }));
    const updates = Array.from({ length: recordCount }, (_, index) => ({
      query: { uid: `u${index + 1}` },
      resource: { displayName: `Updated ${index + 1}` },
    }));

    const statsByOperation: Array<[ScaleOperation, () => Promise<BenchmarkStats>]> = [
      [
        "create",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createEmptyState();
            const users = makeUsers(recordCount);
            return {
              ctx,
              run: async () => {
                for (const user of users) {
                  await repo.create(user);
                }
              },
            };
          }),
      ],
      [
        "get",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createSeededState(recordCount);
            return {
              ctx,
              run: async () => {
                for (const query of queries) {
                  await repo.get(query);
                }
              },
            };
          }),
      ],
      [
        "update",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createSeededState(recordCount);
            return {
              ctx,
              run: async () => {
                for (const update of updates) {
                  await repo.update(update.query, update.resource);
                }
              },
            };
          }),
      ],
      [
        "delete",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createSeededState(recordCount);
            return {
              ctx,
              run: async () => {
                for (const query of queries) {
                  await repo.delete(query);
                }
              },
            };
          }),
      ],
      [
        "list",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createSeededState(recordCount);
            return {
              ctx,
              run: async () => {
                await repo.list(undefined, { pageSize: recordCount });
              },
            };
          }),
      ],
      [
        "count",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createSeededState(recordCount);
            return {
              ctx,
              run: async () => {
                await repo.count();
              },
            };
          }),
      ],
      [
        "batchCreate",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createEmptyState();
            const users = makeUsers(recordCount);
            return {
              ctx,
              run: async () => {
                await repo.batchCreate(users);
              },
            };
          }),
      ],
      [
        "batchGet",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createSeededState(recordCount);
            return {
              ctx,
              run: async () => {
                await repo.batchGet(queries);
              },
            };
          }),
      ],
      [
        "batchUpdate",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createSeededState(recordCount);
            return {
              ctx,
              run: async () => {
                await repo.batchUpdate(updates);
              },
            };
          }),
      ],
      [
        "batchDelete",
        () =>
          measureBenchmark(SCALE_SAMPLES, SCALE_WARMUPS, async () => {
            const { ctx, repo } = await createSeededState(recordCount);
            return {
              ctx,
              run: async () => {
                await repo.batchDelete(queries);
              },
            };
          }),
      ],
    ];

    for (const [operation, measure] of statsByOperation) {
      try {
        const stats = await measure();
        results.push({
          kind: "scale",
          success: true,
          operation,
          recordCount,
          perRecordMs: stats.meanMs / recordCount,
          recordsPerSecond: recordCount / (stats.meanMs / 1000),
          notes: SCALE_OPERATION_NOTES[operation],
          ...stats,
        });
      } catch (error) {
        results.push({
          kind: "scale",
          success: false,
          operation,
          recordCount,
          notes: SCALE_OPERATION_NOTES[operation],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return results;
}

async function runUtilityBenchmarks(): Promise<UtilityBenchmarkResult[]> {
  const prepareUtilityState = async () => {
    const { ctx } = await createEmptyState();
    return { ctx };
  };

  const measurements: Array<[string, BenchmarkStats]> = [
    [
      "buildFilter(partial)",
      await measureBenchmark(UTILITY_SAMPLES, UTILITY_WARMUPS, async () => {
        const { ctx } = await prepareUtilityState();
        return {
          ctx,
          run: async () => {
            buildFilter(
              TestUserSchema,
              { uid: "u1", active: true },
              { columnMap: defaultColumnMap },
            );
          },
        };
      }),
    ],
    [
      "buildFilter(string)",
      await measureBenchmark(UTILITY_SAMPLES, UTILITY_WARMUPS, async () => {
        const { ctx } = await prepareUtilityState();
        return {
          ctx,
          run: async () => {
            buildFilter(TestUserSchema, 'uid = "u1" AND active = true', {
              columnMap: defaultColumnMap,
            });
          },
        };
      }),
    ],
    [
      "serializeMessage",
      await measureBenchmark(UTILITY_SAMPLES, UTILITY_WARMUPS, async () => {
        const { ctx } = await prepareUtilityState();
        return {
          ctx,
          run: async () => {
            serializeMessage(TestUserSchema, utilityMessage);
          },
        };
      }),
    ],
    [
      "deserializeRow",
      await measureBenchmark(UTILITY_SAMPLES, UTILITY_WARMUPS, async () => {
        const { ctx } = await prepareUtilityState();
        return {
          ctx,
          run: async () => {
            deserializeRow(TestUserSchema, utilityRow);
          },
        };
      }),
    ],
  ];

  return measurements.map(([name, stats]) => ({
    kind: "utility",
    name,
    notes: UTILITY_NOTES[name],
    ...stats,
  }));
}

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${ms.toFixed(2)} s`;
  }
  if (ms >= 1) {
    return `${ms.toFixed(2)} ms`;
  }
  return `${(ms * 1000).toFixed(2)} us`;
}

function formatRate(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function formatRatio(value: number): string {
  return `${value.toFixed(2)}x`;
}

function markdownTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function buildMarkdown(report: BenchmarkReport): string {
  const hotspotRecordCount = Math.max(...report.methodology.scales);
  const hotspotSource = report.scaleBenchmarks
    .filter(
      (result): result is SuccessfulScaleBenchmarkResult =>
        result.success && result.recordCount === hotspotRecordCount,
    )
    .sort((left, right) => left.meanMs - right.meanMs);
  const fastestHotspot = hotspotSource[0]?.meanMs ?? 1;
  const hotspotRows = [...hotspotSource]
    .sort((left, right) => right.meanMs - left.meanMs)
    .map((result) => [
      `\`${result.operation}\``,
      `${result.recordCount}`,
      formatDuration(result.meanMs),
      formatDuration(result.perRecordMs),
      formatRate(result.recordsPerSecond),
      formatRatio(result.meanMs / fastestHotspot),
    ]);

  const failedHotspots = report.scaleBenchmarks
    .filter(
      (result): result is FailedScaleBenchmarkResult =>
        !result.success && result.recordCount === hotspotRecordCount,
    )
    .map(
      (result) =>
        `- \`${result.operation}\` at ${hotspotRecordCount} records failed: ${result.error}`,
    );

  const fastestUtility = Math.min(...report.utilityBenchmarks.map((result) => result.meanMs));
  const utilityRows = [...report.utilityBenchmarks]
    .sort((left, right) => right.meanMs - left.meanMs)
    .map((result) => [
      `\`${result.name}\``,
      formatDuration(result.meanMs),
      formatRate(result.opsPerSecond),
      formatRatio(result.meanMs / fastestUtility),
      result.notes,
    ]);

  const scaleSections = [
    "create",
    "get",
    "update",
    "delete",
    "list",
    "count",
    "batchCreate",
    "batchGet",
    "batchUpdate",
    "batchDelete",
  ].map((operation) => {
    const rows = report.scaleBenchmarks
      .filter((result) => result.operation === operation)
      .sort((left, right) => left.recordCount - right.recordCount)
      .map((result) => [
        `${result.recordCount}`,
        result.success ? formatDuration(result.meanMs) : `Failed: ${result.error}`,
        result.success ? formatDuration(result.perRecordMs) : "n/a",
        result.success ? formatRate(result.recordsPerSecond) : "n/a",
        result.success ? `${result.sampleCount}` : "n/a",
      ]);

    return [
      `### \`${operation}\``,
      "",
      SCALE_OPERATION_NOTES[operation as ScaleOperation],
      "",
      markdownTable(
        ["Records", "Mean Total", "Mean / Record", "Records / Second", "Samples"],
        rows,
      ),
    ].join("\n");
  });

  return [
    "# Benchmarks",
    "",
    "This file is generated by `moon run repo:bench`. Do not edit it by hand.",
    "",
    "## Scope",
    "",
    "- Benchmarks use the SQLite engine with an in-memory `better-sqlite3` database.",
    "- The goal is to expose relative repository overhead and how costs change with scale.",
    "- These numbers are useful for comparisons and documentation, not as production SLAs.",
    "",
    "## Environment",
    "",
    markdownTable(
      ["Field", "Value"],
      [
        ["Generated", report.generatedAt],
        ["Package Version", report.packageVersion],
        ["Node", report.environment.node],
        ["Platform", `${report.environment.platform} (${report.environment.arch})`],
        ["CPU", `${report.environment.cpu} x${report.environment.cpuCount}`],
        ["Memory", `${report.environment.memoryGb.toFixed(1)} GB`],
      ],
    ),
    "",
    "## Method Hotspots",
    "",
    `These comparisons anchor on the ${hotspotRecordCount}-record workload so it is easier to spot the slowest paths.`,
    "",
    markdownTable(
      ["Operation", "Records", "Mean Total", "Mean / Record", "Records / Second", "Vs Fastest"],
      hotspotRows,
    ),
    "",
    ...(failedHotspots.length > 0
      ? [`Failed ${hotspotRecordCount}-record benchmarks:`, "", ...failedHotspots, ""]
      : []),
    "",
    "## Utility Overhead",
    "",
    markdownTable(["Utility", "Mean", "Ops / Second", "Vs Fastest", "Notes"], utilityRows),
    "",
    "## Scale Benchmarks",
    "",
    ...scaleSections.flatMap((section) => [section, ""]),
  ].join("\n");
}

function buildDocsMarkdown(report: BenchmarkReport): string {
  const packageMarkdown = buildMarkdown(report);
  const body = packageMarkdown.replace(/^# Benchmarks\n\n/, "");

  return [
    "---",
    "title: Benchmarks",
    "description: Generated benchmark results for @protoutil/repo",
    "---",
    "",
    "This page is generated by `moon run repo:bench`.",
    "",
    body,
  ].join("\n");
}

async function readPackageVersion(): Promise<string> {
  const packageJsonPath = path.join(PACKAGE_DIR, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version: string };
  return packageJson.version;
}

async function writeReport(report: BenchmarkReport) {
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(MARKDOWN_PATH, `${buildMarkdown(report)}\n`, "utf8");
  await mkdir(path.dirname(DOCS_MARKDOWN_PATH), { recursive: true });
  await writeFile(DOCS_MARKDOWN_PATH, `${buildDocsMarkdown(report)}\n`, "utf8");
}

async function main() {
  const scaleBenchmarks = await runScaleBenchmarks();
  const utilityBenchmarks = await runUtilityBenchmarks();
  const packageVersion = await readPackageVersion();
  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    packageVersion,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model ?? "unknown",
      cpuCount: os.cpus().length,
      memoryGb: os.totalmem() / 1024 / 1024 / 1024,
    },
    methodology: {
      backend: "sqlite",
      database: "better-sqlite3 (:memory:)",
      scales: [...SCALES],
      scaleSamples: SCALE_SAMPLES,
      scaleWarmups: SCALE_WARMUPS,
      utilitySamples: UTILITY_SAMPLES,
      utilityWarmups: UTILITY_WARMUPS,
    },
    scaleBenchmarks,
    utilityBenchmarks,
  };

  await writeReport(report);

  console.log(
    `Wrote ${path.relative(PACKAGE_DIR, RESULTS_PATH)}, ${path.basename(MARKDOWN_PATH)}, and docs benchmarks page`,
  );
}

await main();
