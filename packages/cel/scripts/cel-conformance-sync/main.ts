/**
 * Syncs the cel-spec simple-test fixtures into `testdata/conformance`.
 *
 * The fixtures are copied verbatim as `.textproto`. They used to be converted
 * to JSON by a Go program, because TypeScript had no protobuf text format
 * parser; `@bufbuild/protobuf/txtpb` (2.13.0) removed that need, so
 * `conformance.spec.ts` now parses the upstream files directly with
 * `fromText` and there is no intermediate representation to keep in step.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULTS = {
  repo: "https://github.com/cel-expr/cel-spec.git",
  ref: "v0.25.3",
  fixturesSubdir: "tests/simple/testdata",
  out: "./testdata/conformance",
  workdir: "./.tmp/cel-spec-upstream",
};

const FIXTURE_SUFFIX = ".textproto";
/** Suffix of the JSON fixtures this script used to emit, removed on sync. */
const LEGACY_SUFFIX = ".textproto.json";

interface SyncConfig {
  repo: string;
  ref: string;
  fixturesSubdir: string;
  out: string;
  workdir: string;
}

function parseArgs(argv: string[]): SyncConfig {
  const config = { ...DEFAULTS };
  const aliases: Record<string, keyof SyncConfig> = {
    repo: "repo",
    ref: "ref",
    "fixtures-subdir": "fixturesSubdir",
    out: "out",
    workdir: "workdir",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i].replace(/^--?/, "");
    const [name, inline] = arg.includes("=") ? arg.split(/=(.*)/s) : [arg, undefined];
    const key = aliases[name];
    if (!key) {
      throw new Error(`unknown flag: ${argv[i]}`);
    }
    const value = inline ?? argv[++i];
    if (value === undefined) {
      throw new Error(`flag ${argv[i - 1]} requires a value`);
    }
    config[key] = value;
  }
  return config;
}

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
}

/** Clones the fixture repo on first run, then checks out the pinned ref. */
function prepareRepo(repo: string, ref: string, workdir: string): string {
  if (existsSync(join(workdir, ".git"))) {
    git(workdir, "fetch", "--tags", "--force", "origin");
  } else {
    mkdirSync(dirname(workdir), { recursive: true });
    execFileSync("git", ["clone", repo, workdir], { stdio: ["ignore", "ignore", "pipe"] });
  }
  git(workdir, "checkout", "--force", ref);
  git(workdir, "clean", "-fdx");
  return workdir;
}

function syncFixtures(config: SyncConfig): number {
  const repoRoot = prepareRepo(config.repo, config.ref, config.workdir);
  const fixturesDir = join(repoRoot, config.fixturesSubdir);
  mkdirSync(config.out, { recursive: true });

  for (const name of readdirSync(config.out)) {
    if (name.endsWith(FIXTURE_SUFFIX) || name.endsWith(LEGACY_SUFFIX)) {
      rmSync(join(config.out, name));
    }
  }

  const names = readdirSync(fixturesDir)
    .filter((name) => name.endsWith(FIXTURE_SUFFIX))
    .sort();
  for (const name of names) {
    writeFileSync(join(config.out, name), readFileSync(join(fixturesDir, name)));
  }
  return names.length;
}

const config = parseArgs(process.argv.slice(2));
const count = syncFixtures(config);
process.stdout.write(
  `synced ${count} fixtures from ${config.repo}@${config.ref} to ${config.out}\n`,
);
