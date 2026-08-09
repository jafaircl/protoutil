import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRegistry, fromJson } from "@bufbuild/protobuf";
import {
  file_google_protobuf_any,
  file_google_protobuf_duration,
  file_google_protobuf_empty,
  file_google_protobuf_timestamp,
} from "@bufbuild/protobuf/wkt";
import {
  astToCheckedExpr,
  DynType,
  declarationFromProto,
  env,
  type FunctionDecl,
  VariableDecl,
  variable,
} from "@protoutil/cel";
import { file_protoutil_celql_ansisql_v1_ansisql } from "./gen/protoutil/celql/ansisql/v1/ansisql_pb.js";
import {
  type ConformanceCase,
  type ConformanceSuite,
  ConformanceSuiteSchema,
  file_protoutil_celql_conformance_v1_conformance,
} from "./gen/protoutil/celql/conformance/v1/conformance_pb.js";
import { file_protoutil_celql_postgresql_v1_postgresql } from "./gen/protoutil/celql/postgresql/v1/postgresql_pb.js";

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureDirectory = join(packageDirectory, "conformance");

/** Protobuf types that can occur inside a conformance fixture's `Any` values. */
export const conformanceRegistry = createRegistry(
  file_google_protobuf_any,
  file_google_protobuf_duration,
  file_google_protobuf_empty,
  file_google_protobuf_timestamp,
  file_protoutil_celql_conformance_v1_conformance,
  file_protoutil_celql_ansisql_v1_ansisql,
  file_protoutil_celql_postgresql_v1_postgresql,
);

/** Loads every published core and profile suite from its language-independent textproto. */
export function loadConformanceSuites(): ConformanceSuite[] {
  const paths = ["core", "profile/ansisql", "profile/postgresql"].flatMap((directory) =>
    readdirSync(join(fixtureDirectory, directory))
      .filter((name) => name.endsWith(".textproto"))
      .sort()
      .map((name) => join(fixtureDirectory, directory, name)),
  );
  return paths.map((path) => {
    const json = execFileSync(
      "pnpm",
      [
        "exec",
        "buf",
        "convert",
        ".",
        "--type",
        "protoutil.celql.conformance.v1.ConformanceSuite",
        "--from",
        `${path}#format=txtpb`,
        "--to",
        "-#format=json",
      ],
      { cwd: packageDirectory, encoding: "utf8" },
    );
    return fromJson(ConformanceSuiteSchema, JSON.parse(json), {
      registry: conformanceRegistry,
    });
  });
}

/** Compiles a source fixture or returns the deliberately hand-built malformed expression. */
export function compileConformanceCase(suite: ConformanceSuite, testCase: ConformanceCase) {
  if (testCase.input.case === "checkedExpression") {
    return testCase.input.value;
  }
  if (testCase.input.case !== "celSource") {
    throw new Error(`${suite.name}/${testCase.name} has no fixture input`);
  }
  return astToCheckedExpr(
    createConformanceEnvironment(suite, testCase).compile(testCase.input.value),
  );
}

/** Creates the CEL environment declared by one source-form conformance case. */
export function createConformanceEnvironment(suite: ConformanceSuite, testCase: ConformanceCase) {
  if (testCase.input.case !== "celSource") {
    throw new Error(`${suite.name}/${testCase.name} does not contain CEL source`);
  }
  const declarations = (testCase.environment ?? suite.environment)?.declarations ?? [];
  const variables: VariableDecl[] = [];
  const functions: FunctionDecl[] = [];
  for (const declaration of declarations) {
    const value = declarationFromProto(declaration);
    if (value instanceof VariableDecl) {
      const declaredType =
        declaration.declKind.case === "ident"
          ? declaration.declKind.value.type?.typeKind.case
          : undefined;
      // Synthetic message descriptors are not available to this runner. Dyn
      // preserves source checking for their fields and total equality with null.
      variables.push(
        declaredType === "messageType" || testCase.input.value.includes("null")
          ? variable(value.name(), DynType)
          : value,
      );
    } else {
      functions.push(value);
    }
  }
  return env({ variables, functions });
}
