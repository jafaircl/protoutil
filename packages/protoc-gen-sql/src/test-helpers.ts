// Test utilities for protoc-gen-sql.
//
// Uses @bufbuild/protocompile to compile inline proto source strings into
// descriptors, then drives the plugin's generate() and validate() functions
// directly — no file system, no protoc, no buf CLI needed in tests.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFiles } from "@bufbuild/protocompile";
import { generateQueries } from "./generators/queries.js";
import { generateSchema } from "./generators/schema.js";
import { type PluginOptions, parseOptions } from "./util/plugin-options.js";
import { validate } from "./validation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPTIONS_PROTO = readFileSync(
  resolve(__dirname, "..", "proto", "protoutil", "sql", "v1", "options.proto"),
  "utf8",
).trim();
export const LIBRARY_PROTO = readFileSync(
  resolve(__dirname, "..", "proto", "test", "library", "v1", "library.proto"),
  "utf8",
).trim();

type RawOpts = { engine: string } & Partial<Record<string, string>>;

async function compile(protoSource: string) {
  return compileFiles({
    "protoutil/sql/v1/options.proto": OPTIONS_PROTO,
    "test.proto": protoSource,
  });
}

function buildSchema(fds: Awaited<ReturnType<typeof compileFiles>>, opts: PluginOptions) {
  const captured = new Map<string, string[]>();
  const files_generated = new Map<string, string>();
  const files = [...fds.files].filter((f) => f.name !== "sql/options.proto");

  return {
    options: opts,
    files,
    files_generated,

    generateFile(name: string) {
      const lines: string[] = [];
      captured.set(name, lines);
      return {
        print(...args: unknown[]) {
          lines.push(args.join(""));
        },
      };
    },

    flush() {
      for (const [name, lines] of captured) {
        files_generated.set(name, lines.join("\n"));
      }
    },
  };
}

/**
 * Compiles the given proto source, runs full generation (schema + queries),
 * and returns all generated file contents keyed by filename.
 * Throws if validation fails — use generateExpectingErrors for validation tests.
 */
export async function generate(
  protoSource: string,
  rawOpts: RawOpts,
): Promise<Map<string, string>> {
  const fds = await compile(protoSource);
  const opts = parseOptions(
    Object.entries(rawOpts).map(([key, value]) => ({ key, value: value! })),
  );
  const schema = buildSchema(fds, opts);

  const errors = validate(schema as never);
  if (errors.length > 0) {
    throw new Error(
      `protoc-gen-sql validation failed:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`,
    );
  }

  generateSchema(schema as never, opts);
  generateQueries(schema as never, opts);
  schema.flush();

  return schema.files_generated;
}

/**
 * Compiles the given proto source and runs validation only.
 * Returns the list of validation error strings (may be empty if valid).
 * Use this to assert that specific validation rules fire correctly.
 */
export async function validateProto(
  protoSource: string,
  rawOpts: RawOpts = { engine: "postgres" },
): Promise<string[]> {
  const fds = await compile(protoSource);
  const opts = parseOptions(
    Object.entries(rawOpts).map(([key, value]) => ({ key, value: value! })),
  );
  const schema = buildSchema(fds, opts);
  return validate(schema as never);
}
