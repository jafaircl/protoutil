#!/usr/bin/env -S npx tsx
// protoc-gen-sql entry point.
// Reads a CodeGeneratorRequest from stdin via buf/protoc,
// generates SQL schema and query files, writes to stdout.
//
// Usage (via buf.gen.yaml):
//   buf generate

import { createEcmaScriptPlugin, runNodeJs } from "@bufbuild/protoplugin";
import { generateQueries } from "./generators/queries.js";
import { generateSchema } from "./generators/schema.js";
import { parseOptions } from "./util/plugin-options.js";
import { validate } from "./validation.js";

const plugin = createEcmaScriptPlugin({
  name: "protoc-gen-sql",
  version: "v0.1.0",

  parseOptions,

  generateTs(schema) {
    const errors = validate(schema);
    if (errors.length > 0) {
      throw new Error(
        `protoc-gen-sql: ${errors.length} validation error(s) found:\n\n` +
          errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n\n"),
      );
    }
    generateSchema(schema, schema.options);
    generateQueries(schema, schema.options);
  },
});

runNodeJs(plugin);
