import { execFile } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { create } from "@bufbuild/protobuf";
import { anyPack, anyUnpack, DurationSchema, TimestampSchema } from "@bufbuild/protobuf/wkt";
import { astToCheckedExpr, env, listType, StringType, variable } from "@protoutil/cel";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  compileConformanceCase,
  createConformanceEnvironment,
  loadConformanceSuites,
} from "./conformance-fixtures.js";
import type { Type } from "./gen/cel/expr/checked_pb.js";
import { Type_PrimitiveType, Type_WellKnownType } from "./gen/cel/expr/checked_pb.js";
import type { Expr as CheckedExpr } from "./gen/cel/expr/syntax_pb.js";
import {
  type ConformanceCase,
  ConformanceOperation,
  type ConformanceSuite,
  type ProfileExpectation,
} from "./gen/protoutil/celql/conformance/v1/conformance_pb.js";
import {
  AnsiSqlDialect,
  createTranslator,
  type Expr,
  PostgreSqlConfigurationSchema,
  PostgreSqlDialect,
  type PostgreSqlParameter,
  SqlDialect,
  TranslationErrorCode,
} from "./index.js";

const strings = env({
  variables: [variable("name", StringType), variable("tags", listType(StringType))],
});
const postgreSqlProfileName = "protoutil.celql.postgresql";
const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const composeProject = "protoutil-celql-test";
const databaseUrl = "postgresql://celql:celql@127.0.0.1:55432/celql";
const execFileAsync = promisify(execFile);

describe("PostgreSQL dialect", () => {
  it("shares the type-safe SQL visitor with ANSI SQL", () => {
    expect(Object.getPrototypeOf(AnsiSqlDialect.prototype)).toBe(SqlDialect.prototype);
    expect(Object.getPrototypeOf(PostgreSqlDialect.prototype)).toBe(SqlDialect.prototype);
  });

  it("starts numbered parameters at the configured position", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name == "alice"'));
    const profileConfiguration = anyPack(
      PostgreSqlConfigurationSchema,
      create(PostgreSqlConfigurationSchema, { startPosition: 8n }),
    );

    const outcome = createTranslator(PostgreSqlDialect).translate({
      checkedExpression,
      profileConfiguration,
    });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: { sql: '"name" IS NOT DISTINCT FROM $8' },
    });
  });

  it("composes baseline and array expressions with one parameter sequence", () => {
    const checkedExpression = astToCheckedExpr(
      strings.compile('name == "alice" && "admin" in tags'),
    );

    const outcome = createTranslator(PostgreSqlDialect).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: '("name" IS NOT DISTINCT FROM $1 AND CASE WHEN "tags" IS NULL THEN NULL ELSE array_position("tags", $2) IS NOT NULL END)',
        parameters: [
          { value: { kind: { case: "stringValue", value: "alice" } } },
          { value: { kind: { case: "stringValue", value: "admin" } } },
        ],
      },
    });
  });

  it("binds a compatible regular expression", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name.matches("^[a-z]+$")'));

    const outcome = createTranslator(PostgreSqlDialect).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: '("name" COLLATE pg_catalog."C") ~ $1',
        parameters: [{ value: { kind: { case: "stringValue", value: "(?p)^[a-z]+$" } } }],
      },
    });
  });

  it("rejects regex shorthand outside the shared syntax subset", () => {
    const checkedExpression = astToCheckedExpr(strings.compile('name.matches("\\\\d+")'));

    expect(() => createTranslator(PostgreSqlDialect).translate({ checkedExpression })).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_EXPRESSION }),
    );
  });

  it("preserves subclass dispatch inside inherited Boolean operations", () => {
    class AcmePostgreSqlDialect extends PostgreSqlDialect {
      protected override visitCall(expression: Expr, overloadId: string): string {
        if (overloadId !== "matches_string") return super.visitCall(expression, overloadId);
        const [value, pattern] = this.operands(expression);
        if (value === undefined || pattern === undefined) {
          return super.visitCall(expression, overloadId);
        }
        return `acme_matches(${this.visitFieldPath(value)}, ${this.bindConstant(pattern)})`;
      }
    }

    const checkedExpression = astToCheckedExpr(
      strings.compile('name == "alice" || name.matches("^a")'),
    );

    const outcome = createTranslator(AcmePostgreSqlDialect).translate({ checkedExpression });

    expect(outcome).toMatchObject({
      case: "predicate",
      value: {
        sql: '("name" IS NOT DISTINCT FROM $1 OR acme_matches("name", $2))',
        parameters: [
          { value: { kind: { case: "stringValue", value: "alice" } } },
          { value: { kind: { case: "stringValue", value: "^a" } } },
        ],
      },
    });
  });
});

interface DatabaseExecution {
  name: string;
  suite: ConformanceSuite;
  testCase: ConformanceCase;
  expectation: ProfileExpectation;
}

interface QueryPath {
  components: string[];
  type: Type;
}

interface PhysicalColumn extends QueryPath {
  name: string;
}

interface CandidateRecord {
  id: number;
  value: Record<string, unknown>;
}

interface TypedValue {
  type: Type;
  value: unknown;
}

const conformanceSuites = loadConformanceSuites();
const databaseExecutions: DatabaseExecution[] = conformanceSuites.flatMap((suite) =>
  suite.cases.flatMap((testCase) =>
    testCase.expected.flatMap((expectation, expectationIndex) => {
      const expected = expectation.expected;
      if (
        testCase.input.case !== "celSource" ||
        testCase.operation !== ConformanceOperation.TRANSLATE ||
        expectation.profile?.name !== postgreSqlProfileName ||
        expected.case !== "success" ||
        expected.value.outcome.case === "valid" ||
        expected.value.outcome.case === "predicateProduced" ||
        expected.value.outcome.case === undefined
      ) {
        return [];
      }
      return [
        {
          name: `${suite.name}/${testCase.name}/${expectationIndex}`,
          suite,
          testCase,
          expectation,
        },
      ];
    }),
  ),
);

describe("PostgreSQL database conformance", () => {
  const client = new Client({ connectionString: databaseUrl });
  let tableSequence = 0;
  let isConnected = false;

  beforeAll(async () => {
    await runCompose("up", "-d", "--wait");
    try {
      await client.connect();
      isConnected = true;
      await client.query("SET statement_timeout = '5s'");
    } catch (error) {
      await runCompose("down");
      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    if (isConnected) await client.end();
    await runCompose("down");
  }, 30_000);

  it("covers every successful PostgreSQL source expectation", () => {
    const successfulSources = conformanceSuites.flatMap((suite) =>
      suite.cases.flatMap((testCase) =>
        testCase.expected.filter(
          (expectation) =>
            testCase.input.case === "celSource" &&
            testCase.operation === ConformanceOperation.TRANSLATE &&
            expectation.profile?.name === postgreSqlProfileName &&
            expectation.expected.case === "success" &&
            expectation.expected.value.outcome.case !== "valid" &&
            expectation.expected.value.outcome.case !== "predicateProduced" &&
            expectation.expected.value.outcome.case !== undefined,
        ),
      ),
    );
    expect(databaseExecutions).toHaveLength(successfulSources.length);
  });

  for (const execution of databaseExecutions) {
    it(execution.name, async () => {
      const input = execution.testCase.input;
      if (input.case !== "celSource") throw new Error(`${execution.name} has no CEL source.`);
      const checkedExpression = compileConformanceCase(execution.suite, execution.testCase);
      const environment = createConformanceEnvironment(execution.suite, execution.testCase);
      const ast = environment.compile(input.value);
      const program = environment.program(ast);
      const outcome = createTranslator(PostgreSqlDialect).translate({
        checkedExpression,
        profileConfiguration: execution.expectation.profileConfiguration,
        limits: execution.expectation.limits,
      });
      const parameters = outcome.case === "predicate" ? outcome.value.parameters : [];
      const paths = queryPaths(
        checkedExpression.expr,
        checkedExpression.typeMap,
        declarationNames(execution.suite, execution.testCase),
      );
      const records = candidateRecords(paths, parameters.map(typedParameterValue));
      const celRecordIds = records
        .filter((record) => evaluatesTrue(program, record.value))
        .map((record) => record.id);
      const condition =
        outcome.case === "matchAll"
          ? "TRUE"
          : outcome.case === "matchNone"
            ? "FALSE"
            : outcome.value.sql;
      const boundValues = databaseParameterValues(parameters, condition);
      const tableName = `celql_conformance_${++tableSequence}`;
      const columns = paths.map((path) => ({ ...path, name: path.components.join("__") }));

      await client.query(createTableSql(tableName, columns));
      try {
        for (const record of records) {
          await client.query(insertSql(tableName, columns), [
            record.id,
            ...columns.map((column) =>
              databaseValue(column.type, pathValue(record.value, column.components)),
            ),
          ]);
        }
        const result = await client.query<{ id: number }>(
          selectSql(tableName, paths, condition, boundValues.prefixCount),
          boundValues.values,
        );
        expect(result.rows.map((row) => row.id)).toEqual(celRecordIds);
      } finally {
        await client.query(`DROP TABLE ${quoteIdentifier(tableName)}`);
      }
    });
  }
});

async function runCompose(...args: string[]): Promise<void> {
  await execFileAsync("docker", ["compose", "-p", composeProject, ...args], {
    cwd: packageDirectory,
  });
}

function declarationNames(suite: ConformanceSuite, testCase: ConformanceCase): Set<string> {
  return new Set(
    ((testCase.environment ?? suite.environment)?.declarations ?? [])
      .filter((declaration) => declaration.declKind.case === "ident")
      .map((declaration) => declaration.name),
  );
}

function queryPaths(
  root: CheckedExpr | undefined,
  typeMap: Record<string, Type>,
  declarations: ReadonlySet<string>,
): QueryPath[] {
  const paths = new Map<string, QueryPath>();
  const visit = (expression: CheckedExpr | undefined): void => {
    if (expression === undefined) return;
    if (expression.exprKind.case === "selectExpr") {
      const components = selectionComponents(expression);
      const type = typeMap[expression.id.toString()];
      if (components !== undefined && declarations.has(components[0]!) && type !== undefined) {
        paths.set(components.join("\0"), { components, type });
        return;
      }
    }
    if (expression.exprKind.case === "identExpr") {
      const components = expression.exprKind.value.name.split(".");
      const type = typeMap[expression.id.toString()];
      if (declarations.has(components[0]!) && type !== undefined) {
        paths.set(components.join("\0"), { components, type });
      }
      return;
    }
    for (const child of expressionChildren(expression)) visit(child);
  };
  visit(root);
  return [...paths.values()].sort((left, right) =>
    left.components.join(".").localeCompare(right.components.join(".")),
  );
}

function selectionComponents(expression: CheckedExpr): string[] | undefined {
  const components: string[] = [];
  let current: CheckedExpr | undefined = expression;
  while (current?.exprKind.case === "selectExpr") {
    components.unshift(current.exprKind.value.field);
    current = current.exprKind.value.operand;
  }
  if (current?.exprKind.case !== "identExpr") return undefined;
  components.unshift(...current.exprKind.value.name.split("."));
  return components;
}

function expressionChildren(expression: CheckedExpr): CheckedExpr[] {
  switch (expression.exprKind.case) {
    case "selectExpr":
      return expression.exprKind.value.operand === undefined
        ? []
        : [expression.exprKind.value.operand];
    case "callExpr":
      return expression.exprKind.value.target === undefined
        ? expression.exprKind.value.args
        : [expression.exprKind.value.target, ...expression.exprKind.value.args];
    case "listExpr":
      return expression.exprKind.value.elements;
    case "structExpr":
      return expression.exprKind.value.entries.flatMap((entry) => [
        ...(entry.keyKind.case === "mapKey" ? [entry.keyKind.value] : []),
        ...(entry.value === undefined ? [] : [entry.value]),
      ]);
    case "comprehensionExpr":
      return [
        expression.exprKind.value.iterRange,
        expression.exprKind.value.accuInit,
        expression.exprKind.value.loopCondition,
        expression.exprKind.value.loopStep,
        expression.exprKind.value.result,
      ].filter((value): value is CheckedExpr => value !== undefined);
    default:
      return [];
  }
}

function candidateRecords(paths: QueryPath[], parameterValues: TypedValue[]): CandidateRecord[] {
  if (paths.length === 0) return [{ id: 1, value: {} }];
  const candidates = paths.map((path) => valuesForType(path.type, parameterValues));
  const records: Record<string, unknown>[] = [];
  const baseline = candidates.map((values) => values[0]);
  const maximumLength = Math.max(...candidates.map((values) => values.length));
  for (let index = 0; index < maximumLength; index += 1) {
    records.push(
      recordFromValues(
        paths,
        candidates.map((values) => values[index % values.length]),
      ),
    );
  }
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    for (const value of candidates[pathIndex]!) {
      const values = [...baseline];
      values[pathIndex] = value;
      records.push(recordFromValues(paths, values));
    }
  }
  const unique = new Map(records.map((record) => [stableValue(record), record]));
  return [...unique.values()].map((value, index) => ({ id: index + 1, value }));
}

function valuesForType(type: Type, parameterValues: TypedValue[]): unknown[] {
  const matching = parameterValues
    .filter((parameter) => typeKey(parameter.type) === typeKey(type))
    .map((parameter) => parameter.value);
  switch (type.typeKind.case) {
    case "primitive":
      switch (type.typeKind.value) {
        case Type_PrimitiveType.BOOL:
          return uniqueValues([...matching, true, false, null]);
        case Type_PrimitiveType.INT64:
          return uniqueValues([
            ...matching,
            -9_223_372_036_854_775_808n,
            -1n,
            0n,
            1n,
            21n,
            22n,
            null,
          ]);
        case Type_PrimitiveType.UINT64:
          return uniqueValues([...matching, 0n, 1n, 21n, 9_223_372_036_854_775_807n, null]);
        case Type_PrimitiveType.DOUBLE:
          return uniqueValues([...matching, -1, 0, 1, 1.5, 22, null]);
        case Type_PrimitiveType.STRING:
          return uniqueValues([
            ...matching,
            "",
            "alice",
            "bob",
            "admin",
            "reader",
            "abc",
            "ABC",
            "a%_lice",
            "prefix-value-suffix",
            null,
          ]);
        case Type_PrimitiveType.BYTES:
          return uniqueValues([...matching, new Uint8Array(), new Uint8Array([0, 1, 255]), null]);
        default:
          return uniqueValues([...matching, null]);
      }
    case "wellKnown":
      if (type.typeKind.value === Type_WellKnownType.TIMESTAMP) {
        return uniqueValues([
          ...matching,
          create(TimestampSchema, { seconds: 0n }),
          create(TimestampSchema, { seconds: 946_684_800n }),
          create(TimestampSchema, { seconds: 1_735_689_600n }),
          null,
        ]);
      }
      return uniqueValues([
        ...matching,
        create(DurationSchema, { seconds: -1n }),
        create(DurationSchema),
        create(DurationSchema, { seconds: 60n }),
        null,
      ]);
    case "listType": {
      const elementType = type.typeKind.value.elemType;
      if (elementType === undefined) return [[], null];
      const elements = valuesForType(elementType, parameterValues).filter(
        (value) => value !== null,
      );
      return uniqueValues([
        [],
        elements.slice(0, 1),
        elements.slice(0, 2),
        elements.slice(1, 3),
        null,
      ]);
    }
    default:
      return uniqueValues([...matching, "alice", "x", null]);
  }
}

function recordFromValues(paths: QueryPath[], values: unknown[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [index, path] of paths.entries()) {
    let target = record;
    for (const component of path.components.slice(0, -1)) {
      const child = target[component];
      if (typeof child !== "object" || child === null || Array.isArray(child)) {
        target[component] = {};
      }
      target = target[component] as Record<string, unknown>;
    }
    target[path.components.at(-1)!] = values[index];
  }
  return record;
}

function evaluatesTrue(
  program: ReturnType<ReturnType<typeof createConformanceEnvironment>["program"]>,
  value: Record<string, unknown>,
): boolean {
  try {
    return program.eval(value).value() === true;
  } catch {
    return false;
  }
}

function typedParameterValue(parameter: PostgreSqlParameter): TypedValue {
  return { type: parameter.celType!, value: parameterValue(parameter) };
}

function parameterValue(parameter: PostgreSqlParameter): unknown {
  const value = parameter.value?.kind;
  switch (value?.case) {
    case "boolValue":
    case "doubleValue":
    case "stringValue":
    case "bytesValue":
      return value.value;
    case "int64Value":
    case "uint64Value":
      return value.value;
    case "nullValue":
      return null;
    case "objectValue":
      if (value.value.typeUrl.endsWith("google.protobuf.Timestamp")) {
        return anyUnpack(value.value, TimestampSchema);
      }
      if (value.value.typeUrl.endsWith("google.protobuf.Duration")) {
        return anyUnpack(value.value, DurationSchema);
      }
      throw new Error(`The database test cannot bind ${value.value.typeUrl}.`);
    default:
      throw new Error(`The database test cannot bind ${value?.case ?? "an absent value"}.`);
  }
}

function databaseParameterValues(
  parameters: PostgreSqlParameter[],
  condition: string,
): { prefixCount: number; values: unknown[] } {
  const positions = [...condition.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  const firstPosition = positions.length === 0 ? 1 : Math.min(...positions);
  return {
    prefixCount: firstPosition - 1,
    values: [
      ...Array.from({ length: firstPosition - 1 }, () => null),
      ...parameters.map((parameter) =>
        databaseValue(parameter.celType!, parameterValue(parameter)),
      ),
    ],
  };
}

function createTableSql(tableName: string, columns: PhysicalColumn[]): string {
  const definitions = columns.map(
    (column) => `${quoteIdentifier(column.name)} ${postgreSqlType(column.type)}`,
  );
  return `CREATE TEMPORARY TABLE ${quoteIdentifier(tableName)} (${[
    '"id" INTEGER PRIMARY KEY',
    ...definitions,
  ].join(", ")})`;
}

function insertSql(tableName: string, columns: PhysicalColumn[]): string {
  const names = ["id", ...columns.map((column) => column.name)].map(quoteIdentifier);
  const markers = names.map((_, index) => `$${index + 1}`);
  return `INSERT INTO ${quoteIdentifier(tableName)} (${names.join(", ")}) VALUES (${markers.join(", ")})`;
}

function selectSql(
  tableName: string,
  paths: QueryPath[],
  condition: string,
  prefixCount: number,
): string {
  const nestedRoots = new Map<string, QueryPath[]>();
  for (const path of paths.filter((candidate) => candidate.components.length > 1)) {
    const root = path.components[0]!;
    const existing = nestedRoots.get(root) ?? [];
    existing.push(path);
    nestedRoots.set(root, existing);
  }
  const lateralJoins = [...nestedRoots].map(([root, nestedPaths]) => {
    const fields = nestedPaths.map((path) => {
      if (path.components.length !== 2) {
        throw new Error(`The database fixture cannot materialize ${path.components.join(".")}.`);
      }
      return `${quoteIdentifier(path.components.join("__"))} AS ${quoteIdentifier(path.components[1]!)}`;
    });
    return `CROSS JOIN LATERAL (SELECT ${fields.join(", ")}) AS ${quoteIdentifier(root)}`;
  });
  const prefix =
    prefixCount === 0
      ? ""
      : `WITH ignored_parameters AS (SELECT ${Array.from(
          { length: prefixCount },
          (_, index) => `$${index + 1}::text`,
        ).join(", ")}) `;
  return `${prefix}SELECT "id" FROM ${quoteIdentifier(tableName)} ${lateralJoins.join(" ")} WHERE ${condition} ORDER BY "id"`;
}

function postgreSqlType(type: Type): string {
  switch (type.typeKind.case) {
    case "primitive":
      return (
        (
          {
            [Type_PrimitiveType.BOOL]: "BOOLEAN",
            [Type_PrimitiveType.INT64]: "BIGINT",
            [Type_PrimitiveType.UINT64]: "NUMERIC(20, 0)",
            [Type_PrimitiveType.DOUBLE]: "DOUBLE PRECISION",
            [Type_PrimitiveType.STRING]: "TEXT",
            [Type_PrimitiveType.BYTES]: "BYTEA",
          } as Record<number, string>
        )[type.typeKind.value] ?? "TEXT"
      );
    case "wellKnown":
      return type.typeKind.value === Type_WellKnownType.TIMESTAMP ? "TIMESTAMPTZ" : "INTERVAL";
    case "listType":
      return `${type.typeKind.value.elemType === undefined ? "TEXT" : postgreSqlType(type.typeKind.value.elemType)}[]`;
    default:
      return "TEXT";
  }
}

function databaseValue(type: Type, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (type.typeKind.case === "listType") {
    const elementType = type.typeKind.value.elemType;
    return elementType === undefined
      ? value
      : (value as unknown[]).map((element) => databaseValue(elementType, element));
  }
  if (
    type.typeKind.case === "primitive" &&
    (type.typeKind.value === Type_PrimitiveType.INT64 ||
      type.typeKind.value === Type_PrimitiveType.UINT64)
  ) {
    return (value as bigint).toString();
  }
  if (type.typeKind.case === "wellKnown") {
    if (type.typeKind.value === Type_WellKnownType.TIMESTAMP) {
      const timestamp = value as { seconds: bigint; nanos: number };
      return new Date(Number(timestamp.seconds) * 1000 + timestamp.nanos / 1_000_000).toISOString();
    }
    const duration = value as { seconds: bigint; nanos: number };
    return `${duration.seconds}.${Math.abs(duration.nanos).toString().padStart(9, "0")} seconds`;
  }
  return value;
}

function pathValue(value: Record<string, unknown>, components: string[]): unknown {
  let current: unknown = value;
  for (const component of components) {
    if (typeof current !== "object" || current === null) return null;
    current = (current as Record<string, unknown>)[component];
  }
  return current;
}

function typeKey(type: Type): string {
  switch (type.typeKind.case) {
    case "primitive":
      return `primitive:${type.typeKind.value}`;
    case "wellKnown":
      return `wellKnown:${type.typeKind.value}`;
    case "listType":
      return `list:${type.typeKind.value.elemType === undefined ? "dyn" : typeKey(type.typeKind.value.elemType)}`;
    default:
      return type.typeKind.case ?? "unknown";
  }
}

function stableValue(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return `${item}n`;
    if (item instanceof Uint8Array) return `bytes:${Buffer.from(item).toString("base64")}`;
    return item;
  });
}

function uniqueValues(values: unknown[]): unknown[] {
  return [...new Map(values.map((value) => [stableValue(value), value])).values()];
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}
