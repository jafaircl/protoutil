// Copyright 2026
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** packageRoot is the absolute path to the local CEL package. */
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** upstreamRoot is the cel-go repository whose test functions define the coverage denominator. */
const upstreamRoot = join(packageRoot, ".tmp", "cel-go-upstream");

/** localRoot contains the canonical TypeScript specifications for the complete CEL library. */
const localRoot = join(packageRoot, "src");

/** ledgerPath is the generated, durable coverage report checked into the repository. */
const ledgerPath = join(packageRoot, "testdata", "cel-go", "coverage-ledger.md");

/**
 * sourceFiles returns sorted files in a directory whose names satisfy the supplied predicate.
 *
 * @param directory directory to inspect
 * @param options filename selection options
 */
function sourceFiles(directory, options) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path, options));
      continue;
    }
    if (entry.name.endsWith(options.suffix)) {
      files.push(path);
    }
  }
  return files.sort();
}

/**
 * upstreamFunctions inventories every top-level cel-go test and example function.
 */
function upstreamFunctions() {
  const functions = [];
  for (const path of sourceFiles(upstreamRoot, { suffix: "_test.go" })) {
    const file = relative(upstreamRoot, path);
    const content = readFileSync(path, "utf8");
    const pattern = /^func (Test[A-Za-z0-9_]*|Example[A-Za-z0-9_]*)\s*\(/gm;
    for (const match of content.matchAll(pattern)) {
      const name = match[1];
      functions.push({
        file,
        key: `${file}/${name}`,
        kind: name.startsWith("Example") ? "example" : "test",
        name,
      });
    }
  }
  return functions;
}

/**
 * localCoverage maps exact upstream keys to the local specifications which exercise them.
 */
function localCoverage() {
  const coverage = new Map();
  for (const path of sourceFiles(localRoot, { suffix: ".spec.ts" })) {
    const content = readFileSync(path, "utf8");
    const spec = relative(packageRoot, path);
    const keyPattern = /(["'`])([^"'`\n]+_test\.go\/(?:Test|Example)[A-Za-z0-9_]*)[^"'`\n]*\1/g;
    for (const match of content.matchAll(keyPattern)) {
      coverage.set(match[2], { spec, status: "covered" });
    }

    const todoPattern =
      /\bit\.todo\(\s*(["'`])([^"'`\n]+_test\.go\/(?:Test|Example)[A-Za-z0-9_]*)[^"'`\n]*\1/g;
    for (const match of content.matchAll(todoPattern)) {
      coverage.set(match[2], { spec, status: "todo" });
    }
    const skippedPattern =
      /\b(?:it|test|describe)\.skip\(\s*(["'`])([^"'`\n]+_test\.go\/(?:Test|Example)[A-Za-z0-9_]*)[^"'`\n]*\1/g;
    for (const match of content.matchAll(skippedPattern)) {
      coverage.set(match[2], { spec, status: "skipped" });
    }

    // A describe may carry the upstream key while its only child is a TODO with a blocker message.
    const describePattern =
      /describe\((["'`])([^"'`\n]+_test\.go\/(?:Test|Example)[A-Za-z0-9_]*)\1\s*,/g;
    const matches = [...content.matchAll(describePattern)];
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? content.length;
      const block = content.slice(start, end);
      if (/\bit\.todo\s*\(/.test(block) && !/\bit(?:\.each)?\s*\(/.test(block)) {
        coverage.set(match[2], { spec, status: "todo" });
      }
    }
  }
  return coverage;
}

/**
 * percent formats a numerator as a percentage of a denominator.
 */
function percent(numerator, denominator) {
  return denominator === 0 ? "100.0%" : `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/**
 * buildLedger renders the upstream-to-TypeScript coverage ledger as Markdown.
 */
function buildLedger() {
  const functions = upstreamFunctions();
  const coverage = localCoverage();
  const rows = functions.map((entry) => {
    const local = coverage.get(entry.key);
    return { ...entry, spec: local?.spec ?? "—", status: local?.status ?? "missing" };
  });
  const tests = rows.filter((row) => row.kind === "test");
  const examples = rows.filter((row) => row.kind === "example");
  const coveredTests = tests.filter((row) => row.status === "covered").length;
  const coveredExamples = examples.filter((row) => row.status === "covered").length;
  const todoTests = tests.filter((row) => row.status === "todo").length;
  const skippedTests = tests.filter((row) => row.status === "skipped").length;
  const packages = [...new Set(rows.map((row) => dirname(row.file)))].sort();

  const lines = [
    "# cel-go Coverage Ledger",
    "",
    "Generated recursively from `.tmp/cel-go-upstream/**/*_test.go` by:",
    "",
    "```sh",
    "node scripts/cel-coverage-ledger.mjs",
    "```",
    "",
    "An entry is **covered** when its exact upstream key appears in a local `describe`, `it`, `test`,",
    "or synced-case declaration under `src`. This is a structural tracking signal; subsystem",
    "completion still requires reviewing assertions and implementation against the upstream source.",
    "",
    "| Kind | Covered | TODO | Skipped | Missing | Total | Coverage |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    `| Tests | ${coveredTests} | ${todoTests} | ${skippedTests} | ${tests.length - coveredTests - todoTests - skippedTests} | ${tests.length} | ${percent(coveredTests, tests.length)} |`,
    `| Examples | ${coveredExamples} | 0 | 0 | ${examples.length - coveredExamples} | ${examples.length} | ${percent(coveredExamples, examples.length)} |`,
    "",
    "## Package summary",
    "",
    "| Upstream package | Covered | TODO | Skipped | Missing | Total | Coverage |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const packageName of packages) {
    const packageRows = rows.filter((row) => dirname(row.file) === packageName);
    const covered = packageRows.filter((row) => row.status === "covered").length;
    const todo = packageRows.filter((row) => row.status === "todo").length;
    const skipped = packageRows.filter((row) => row.status === "skipped").length;
    lines.push(
      `| \`${packageName}\` | ${covered} | ${todo} | ${skipped} | ${packageRows.length - covered - todo - skipped} | ${packageRows.length} | ${percent(covered, packageRows.length)} |`,
    );
  }
  lines.push("", "## Test functions", "");

  for (const file of [...new Set(rows.map((row) => row.file))]) {
    lines.push(
      `### \`${file}\``,
      "",
      "| Upstream function | Status | Canonical spec |",
      "| --- | --- | --- |",
    );
    for (const row of rows.filter((entry) => entry.file === file)) {
      lines.push(`| \`${row.name}\` | ${row.status} | \`${row.spec}\` |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

writeFileSync(ledgerPath, buildLedger());
