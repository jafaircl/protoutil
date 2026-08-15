import { execFile } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { create, type DescMessage } from "@bufbuild/protobuf";
import { anyUnpack, DurationSchema, TimestampSchema } from "@bufbuild/protobuf/wkt";
import { Timestamp } from "@protoutil/cel";
import Database from "better-sqlite3";
import { type Document, Long, MongoClient } from "mongodb";
import { type Connection, createConnection, type RowDataPacket } from "mysql2/promise";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AnsiSqlProfile } from "./ansisql/index.js";
import {
  compileConformanceCase,
  conformanceRegistry,
  createConformanceEnvironment,
  loadConformanceSuites,
} from "./conformance-fixtures.js";
import type { Type } from "./gen/cel/expr/checked_pb.js";
import { Type_PrimitiveType, Type_WellKnownType } from "./gen/cel/expr/checked_pb.js";
import type { Expr } from "./gen/cel/expr/syntax_pb.js";
import type {
  AnsiSqlParameter,
  AnsiSqlPredicate,
} from "./gen/protoutil/celql/ansisql/v1/ansisql_pb.js";
import {
  type ConformanceCase,
  ConformanceOperation,
  type ConformanceSuite,
  type ProfileExpectation,
} from "./gen/protoutil/celql/conformance/v1/conformance_pb.js";
import type { LibraryReference, ProfileReference } from "./gen/protoutil/celql/v1/celql_pb.js";
import { TranslationErrorCode } from "./gen/protoutil/celql/v1/celql_pb.js";
import {
  CelqlError,
  createTranslator,
  FullTextIndexType,
  FullTextIndexValue,
  GeoPointType,
  GeoPointValue,
  geoPointText,
  type Profile,
  parameterValue,
  TimestampRangeType,
  TimestampRangeValue,
  type TranslationLibrary,
  type TranslationOutcome,
} from "./index.js";
import type { MongoDbPredicate } from "./mongodb/index.js";
import {
  MongoDbProfile,
  caseInsensitiveStrings as mongoCaseInsensitiveStrings,
  mongoDbFilter,
  fullTextSearch as mongoFullTextSearch,
  geospatial as mongoGeospatial,
} from "./mongodb/index.js";
import {
  MySqlProfile,
  caseInsensitiveStrings as mySqlCaseInsensitiveStrings,
  fullTextSearch as mySqlFullTextSearch,
  geospatial as mySqlGeospatial,
} from "./mysql/index.js";
import {
  caseInsensitiveStrings,
  fullTextSearch,
  type PostgreSqlParameter,
  type PostgreSqlPredicate,
  PostgreSqlPredicateSchema,
  PostgreSqlProfile,
  postgreSqlParameters,
  timestampRanges,
} from "./postgresql/index.js";
import {
  SqliteProfile,
  caseInsensitiveStrings as sqliteCaseInsensitiveStrings,
  fullTextSearch as sqliteFullTextSearch,
} from "./sqlite/index.js";

// The fixture runner erases target-specific translation-function types because it selects profiles dynamically.
// biome-ignore lint/suspicious/noExplicitAny: runtime profile selection requires one erased translation type.
type ConformanceTranslation = any;

const ansiProfile = {
  name: "protoutil.celql.ansisql",
  majorVersion: 1,
} as const;
const availableProfiles: readonly Profile<DescMessage, ConformanceTranslation>[] = [
  new AnsiSqlProfile(),
  new MongoDbProfile(),
  new MySqlProfile(),
  new PostgreSqlProfile(),
  new SqliteProfile(),
];

interface Execution {
  name: string;
  suite: ConformanceSuite;
  testCase: ConformanceCase;
  profile?: ProfileReference;
  libraries: LibraryReference[];
  profileConfiguration?: ProfileExpectation["profileConfiguration"];
  expected: ProfileExpectation["expected"];
  limits?: ProfileExpectation["limits"];
}

type ExecutionResult =
  | { case: "success"; outcome?: TranslationOutcome }
  | { case: "error"; error: CelqlError }
  | { case: "unavailable"; library: string };

function execute(execution: Execution) {
  const checkedExpression = compileConformanceCase(execution.suite, execution.testCase);
  try {
    const profile = resolveProfile(execution.profile);
    const libraries = resolveLibraries(profile.capability.profile!, execution.libraries);
    const translator = createTranslator(profile, { libraries });
    const request = {
      checkedExpression,
      limits: execution.limits,
      profileConfiguration: execution.profileConfiguration,
    };
    if (execution.testCase.operation === ConformanceOperation.VALIDATE) {
      translator.validate(request);
      return { checkedExpression, result: { case: "success" } as ExecutionResult };
    }
    return {
      checkedExpression,
      result: {
        case: "success",
        outcome: translator.translate(request),
      } as ExecutionResult,
    };
  } catch (error) {
    if (error instanceof UnavailableConformanceLibraryError) {
      return {
        checkedExpression,
        result: { case: "unavailable", library: error.library } as ExecutionResult,
      };
    }
    if (!(error instanceof CelqlError)) {
      throw error;
    }
    return { checkedExpression, result: { case: "error", error } as ExecutionResult };
  }
}

function assertExpected(execution: Execution): ExecutionResult {
  const { checkedExpression, result } = execute(execution);
  const expected = execution.expected;
  if (result.case === "unavailable") return result;
  if (expected.case === "error") {
    expect(result).toMatchObject({ case: "error", error: { code: expected.value.code } });
    if (result.case === "error" && expected.value.expressionNodeId !== undefined) {
      expect(result.error.expressionNodeId).toBe(expected.value.expressionNodeId);
    }
    if (result.case === "error") {
      const diagnostics = [result.error.message, ...Object.values(result.error.details)].join("\n");
      for (const constant of sensitiveConstants(checkedExpression.expr)) {
        expect(diagnostics).not.toContain(constant);
      }
    }
    return result;
  }

  expect(expected.case).toBe("success");
  expect(result.case).toBe("success");
  if (result.case !== "success" || expected.case !== "success") {
    return result;
  }
  switch (expected.value.outcome.case) {
    case "valid":
      expect(execution.testCase.operation).toBe(ConformanceOperation.VALIDATE);
      break;
    case "matchAll":
      expect(result.outcome).toMatchObject({ case: "matchAll" });
      break;
    case "matchNone":
      expect(result.outcome).toMatchObject({ case: "matchNone" });
      break;
    case "predicateProduced":
      expect(result.outcome).toMatchObject({ case: "predicate" });
      break;
    case "exactPredicate": {
      expect(result.outcome).toMatchObject({ case: "predicate" });
      if (result.outcome?.case === "predicate") {
        expect(result.outcome.value).toEqual(
          anyUnpack(expected.value.outcome.value, conformanceRegistry),
        );
      }
      break;
    }
    default:
      throw new Error(`${execution.name} has no expected success outcome`);
  }
  if (result.outcome?.case === "predicate") {
    const profile = resolveProfile(execution.profile);
    const capability = createTranslator(profile, {
      libraries: resolveLibraries(profile.capability.profile!, execution.libraries),
    }).capability();
    expect(result.outcome.value.$typeName).toBe(capability.outputTypeName);
  }
  return result;
}

function resolveProfile(
  reference: ProfileReference | undefined,
): Profile<DescMessage, ConformanceTranslation> {
  const requested = reference ?? ansiProfile;
  const profile = availableProfiles.find(
    (candidate) => candidate.capability.profile?.name === requested.name,
  );
  if (profile === undefined) {
    throw new CelqlError(TranslationErrorCode.UNSUPPORTED_PROFILE, {
      message: `The profile ${requested.name} is not available to this conformance runner.`,
    });
  }
  if (requested.majorVersion !== profile.capability.profile?.majorVersion) {
    throw new CelqlError(TranslationErrorCode.UNSUPPORTED_PROFILE_VERSION, {
      message: `The profile version ${requested.majorVersion} is not available to this conformance runner.`,
    });
  }
  return profile;
}

function resolveLibraries(
  profile: ProfileReference,
  references: readonly LibraryReference[],
): TranslationLibrary<ConformanceTranslation>[] {
  return references.map((reference) => {
    if (
      reference.name === "protoutil.celql.case_insensitive_strings" &&
      reference.majorVersion === 1
    ) {
      if (profile.name === PostgreSqlProfile.capability.profile?.name)
        return caseInsensitiveStrings();
      if (profile.name === MySqlProfile.capability.profile?.name)
        return mySqlCaseInsensitiveStrings();
      if (profile.name === SqliteProfile.capability.profile?.name)
        return sqliteCaseInsensitiveStrings();
      if (profile.name === MongoDbProfile.capability.profile?.name)
        return mongoCaseInsensitiveStrings();
    }
    if (
      profile.name === PostgreSqlProfile.capability.profile?.name &&
      reference.name === "protoutil.celql.timestamp_ranges" &&
      reference.majorVersion === 1
    ) {
      return timestampRanges();
    }
    if (
      profile.name === PostgreSqlProfile.capability.profile?.name &&
      reference.name === "protoutil.celql.full_text_search" &&
      reference.majorVersion === 1
    ) {
      return fullTextSearch();
    }
    if (
      profile.name === MySqlProfile.capability.profile?.name &&
      reference.name === "protoutil.celql.full_text_search" &&
      reference.majorVersion === 1
    ) {
      return mySqlFullTextSearch();
    }
    if (
      profile.name === SqliteProfile.capability.profile?.name &&
      reference.name === "protoutil.celql.full_text_search" &&
      reference.majorVersion === 1
    ) {
      return sqliteFullTextSearch();
    }
    if (
      profile.name === MongoDbProfile.capability.profile?.name &&
      reference.name === "protoutil.celql.full_text_search" &&
      reference.majorVersion === 1
    ) {
      return mongoFullTextSearch();
    }
    if (reference.name === "protoutil.celql.geospatial" && reference.majorVersion === 1) {
      if (profile.name === MySqlProfile.capability.profile?.name) return mySqlGeospatial();
      if (profile.name === MongoDbProfile.capability.profile?.name) return mongoGeospatial();
    }
    throw new UnavailableConformanceLibraryError(`${reference.name}@${reference.majorVersion}`);
  });
}

class UnavailableConformanceLibraryError extends Error {
  public constructor(public readonly library: string) {
    super(`The library ${library} is not available in this conformance runner.`);
  }
}

function sensitiveConstants(root: Expr | undefined): string[] {
  const values: string[] = [];
  const stack = root === undefined ? [] : [root];
  while (stack.length > 0) {
    const expression = stack.pop()!;
    switch (expression.exprKind.case) {
      case "constExpr":
        if (expression.exprKind.value.constantKind.case === "stringValue") {
          values.push(expression.exprKind.value.constantKind.value);
        } else if (expression.exprKind.value.constantKind.case === "bytesValue") {
          values.push(Buffer.from(expression.exprKind.value.constantKind.value).toString("utf8"));
        }
        break;
      case "selectExpr":
        if (expression.exprKind.value.operand !== undefined) {
          stack.push(expression.exprKind.value.operand);
        }
        break;
      case "callExpr":
        stack.push(...expression.exprKind.value.args);
        if (expression.exprKind.value.target !== undefined) {
          stack.push(expression.exprKind.value.target);
        }
        break;
      case "listExpr":
        stack.push(...expression.exprKind.value.elements);
        break;
      case "structExpr":
        for (const entry of expression.exprKind.value.entries) {
          if (entry.value !== undefined) stack.push(entry.value);
          if (entry.keyKind.case === "mapKey") stack.push(entry.keyKind.value);
        }
        break;
      case "comprehensionExpr": {
        const comprehension = expression.exprKind.value;
        for (const child of [
          comprehension.iterRange,
          comprehension.accuInit,
          comprehension.loopCondition,
          comprehension.loopStep,
          comprehension.result,
        ]) {
          if (child !== undefined) stack.push(child);
        }
        break;
      }
    }
  }
  return values.filter((value) => value.length >= 8);
}

const suites = loadConformanceSuites();
const executions = selectConformanceExecutions(suites);

function selectConformanceExecutions(conformanceSuites: readonly ConformanceSuite[]): Execution[] {
  const selected: Execution[] = [];
  for (const suite of conformanceSuites) {
    for (const testCase of suite.cases) {
      for (const [expectationIndex, expectation] of testCase.expected.entries()) {
        selected.push({
          name: `${suite.name}/${testCase.name}/${expectation.profile?.name ?? "missing-profile"}/${expectationIndex}`,
          suite,
          testCase,
          ...expectation,
        });
      }
    }
  }
  return selected;
}

describe("celql conformance", () => {
  it("loads the complete published corpus", () => {
    let caseCount = 0;
    let expectationCount = 0;
    for (const suite of suites) {
      caseCount += suite.cases.length;
      for (const testCase of suite.cases) expectationCount += testCase.expected.length;
    }
    expect(caseCount).toBe(198);
    expect(expectationCount).toBe(924);
  });

  it("executes every profile expectation attached to a shared input", () => {
    let expectationCount = 0;
    for (const suite of suites) {
      for (const testCase of suite.cases) expectationCount += testCase.expected.length;
    }
    expect(executions).toHaveLength(expectationCount);
  });

  it("publishes an expectation for every profile on each shared core source form", () => {
    const requiredProfiles = new Set(
      availableProfiles.map((profile) => profile.capability.profile!.name),
    );
    const violations: string[] = [];
    for (const suite of suites) {
      if (suite.level !== 1 || suite.name === "celql-core-selection") continue;
      for (const testCase of suite.cases) {
        if (testCase.input.case !== "celSource") continue;
        const declaredProfiles = new Set(
          testCase.expected.map((expectation) => expectation.profile?.name),
        );
        for (const profileName of requiredProfiles) {
          if (!declaredProfiles.has(profileName)) {
            violations.push(`${suite.name}/${testCase.name}/${profileName}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("uses CEL source for every successful predicate expectation", () => {
    const violations: string[] = [];
    for (const suite of suites) {
      for (const testCase of suite.cases) {
        const hasSuccessfulPredicate = testCase.expected.some(
          (profileExpectation) =>
            profileExpectation.expected.case === "success" &&
            profileExpectation.expected.value.outcome.case === "exactPredicate",
        );
        if (testCase.input.case !== "celSource" && hasSuccessfulPredicate) {
          violations.push(`${suite.name}/${testCase.name}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  for (const execution of executions) {
    it(execution.name, () => {
      const first = assertExpected(execution);
      const second = assertExpected(execution);
      expect(second).toEqual(first);
    });
  }

  it("is independent of case order", () => {
    const forward = new Map(
      executions.map((execution) => [execution.name, assertExpected(execution)]),
    );
    const reverse = new Map(
      [...executions].reverse().map((execution) => [execution.name, assertExpected(execution)]),
    );
    expect(reverse).toEqual(forward);
  });

  it("rejects unsupported versions and reserved capability identifiers", () => {
    for (const profile of availableProfiles) {
      const capability = createTranslator(profile).capability();
      expect(
        capability.operations.some((operation) =>
          operation.overloadId.startsWith("celql.reserved.unsupported."),
        ),
      ).toBe(false);
      expect(() =>
        resolveProfile({
          $typeName: "protoutil.celql.v1.ProfileReference",
          name: capability.profile!.name,
          majorVersion: capability.profile!.majorVersion + 10_000,
        }),
      ).toThrow(
        expect.objectContaining({ code: TranslationErrorCode.UNSUPPORTED_PROFILE_VERSION }),
      );
    }
  });

  it("reports a library that the runner does not provide as unavailable", () => {
    const execution = executions[0]!;
    const { result } = execute({
      ...execution,
      libraries: [
        {
          $typeName: "protoutil.celql.v1.LibraryReference",
          name: "example.unavailable",
          majorVersion: 1,
        },
      ],
    });

    expect(result).toEqual({
      case: "unavailable",
      library: "example.unavailable@1",
    });
  });

  it("publishes every operation of each available translation library", () => {
    const selected = caseInsensitiveStrings();
    const capability = createTranslator(new PostgreSqlProfile(), {
      libraries: [selected],
    }).capability();

    expect(capability.libraries).toMatchObject([
      { name: selected.reference.name, majorVersion: selected.reference.majorVersion },
    ]);
    expect(
      capability.operations
        .filter((operation) =>
          selected.functions.some(
            (translationFunction) =>
              translationFunction.capability.overloadId === operation.overloadId,
          ),
        )
        .map((operation) => operation.overloadId),
    ).toEqual(selected.functions.map(({ capability: operation }) => operation.overloadId));
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

interface CandidateRecord {
  id: number;
  value: Record<string, unknown>;
}

interface TypedValue {
  type: Type;
  value: unknown;
}

type SqlBinding = string | number | bigint | boolean | null | Uint8Array;

const databaseProfileNames = new Set([
  "protoutil.celql.postgresql",
  "protoutil.celql.mysql",
  "protoutil.celql.mongodb",
  "protoutil.celql.sqlite",
]);
const composeProject = "protoutil-celql-conformance";
const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const execFileAsync = promisify(execFile);
const databaseExecutions = selectDatabaseExecutions(suites);

// CEL evaluation is the differential oracle. Each successful source
// expectation runs against its declared target with records generated from
// the checked field and constant types.
describe("real database conformance", () => {
  const postgres = new Client({
    connectionString: "postgresql://celql:celql@127.0.0.1:55432/celql",
  });
  let mysql: Connection | undefined;
  let mongodb: MongoClient | undefined;
  let sqlite: Database.Database | undefined;
  let postgresConnected = false;
  let tableSequence = 0;

  beforeAll(async () => {
    await runCompose("up", "-d", "--wait", "postgres", "mysql", "mongodb");
    try {
      await postgres.connect();
      postgresConnected = true;
      await postgres.query("SET statement_timeout = '5s'");
      mysql = await connectMySql();
      mongodb = new MongoClient("mongodb://celql:celql@127.0.0.1:57017/?authSource=admin");
      await mongodb.connect();
      sqlite = new Database(":memory:");
    } catch (error) {
      await closeDatabases();
      await runCompose("down");
      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    try {
      await closeDatabases();
    } finally {
      await runCompose("down");
    }
  }, 30_000);

  async function closeDatabases(): Promise<void> {
    sqlite?.close();
    sqlite = undefined;
    await mysql?.end();
    mysql = undefined;
    await mongodb?.close();
    mongodb = undefined;
    if (postgresConnected) {
      await postgres.end();
      postgresConnected = false;
    }
  }

  async function connectMySql(): Promise<Connection> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await createConnection({
          host: "127.0.0.1",
          port: 53306,
          user: "celql",
          password: "celql",
          database: "celql",
          multipleStatements: false,
        });
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw lastError;
  }

  it("covers every successful executable database expectation", () => {
    const expectedCount = executions.filter((execution) => {
      const outcome =
        execution.expected.case === "success" ? execution.expected.value.outcome.case : undefined;
      return (
        execution.testCase.input.case === "celSource" &&
        execution.testCase.operation === ConformanceOperation.TRANSLATE &&
        databaseProfileNames.has(execution.profile?.name ?? "") &&
        outcome !== undefined &&
        outcome !== "valid" &&
        outcome !== "predicateProduced"
      );
    }).length;
    expect(databaseExecutions).toHaveLength(expectedCount);
  });

  for (const execution of databaseExecutions) {
    it(execution.name, async () => {
      const input = execution.testCase.input;
      if (input.case !== "celSource") throw new Error(`${execution.name} has no CEL source.`);
      const checkedExpression = compileConformanceCase(execution.suite, execution.testCase);
      const environment = createConformanceEnvironment(execution.suite, execution.testCase);
      const program = environment.program(environment.compile(input.value));
      const profile = resolveProfile(execution.expectation.profile);
      const translator = createTranslator(profile, {
        libraries: resolveLibraries(profile.capability.profile!, execution.expectation.libraries),
      });
      const outcome = translator.translate({
        checkedExpression,
        profileConfiguration: execution.expectation.profileConfiguration,
        limits: execution.expectation.limits,
      });
      const paths = queryPaths(
        checkedExpression.expr,
        checkedExpression.typeMap,
        declarationNames(execution.suite, execution.testCase),
      );
      const parameterValues =
        outcome.case === "predicate" && "parameters" in outcome.value
          ? (outcome.value.parameters as PostgreSqlParameter[]).map(typedParameterValue)
          : constantValues(checkedExpression.expr, checkedExpression.typeMap);
      const records = candidateRecords(paths, parameterValues);
      const expectedIds = records
        .filter((record) => evaluatesTrue(program, record.value))
        .map((record) => record.id);
      const profileName = execution.expectation.profile?.name;

      if (profileName === "protoutil.celql.postgresql") {
        await expectPostgreSqlIds(
          postgres,
          `celql_conformance_${++tableSequence}`,
          paths,
          records,
          outcome,
          expectedIds,
        );
      } else if (profileName === "protoutil.celql.mysql") {
        await expectMySqlIds(mysql!, paths, records, outcome, expectedIds);
      } else if (profileName === "protoutil.celql.sqlite") {
        expectSqliteIds(sqlite!, paths, records, outcome, expectedIds);
      } else if (profileName === "protoutil.celql.mongodb") {
        await expectMongoDbIds(mongodb!, paths, records, outcome, expectedIds);
      } else {
        throw new Error(`${execution.name} selected a non-database profile.`);
      }
    });
  }
});

function selectDatabaseExecutions(
  conformanceSuites: readonly ConformanceSuite[],
): DatabaseExecution[] {
  const selected: DatabaseExecution[] = [];
  for (const suite of conformanceSuites) {
    for (const testCase of suite.cases) {
      for (const [expectationIndex, expectation] of testCase.expected.entries()) {
        const outcome =
          expectation.expected.case === "success"
            ? expectation.expected.value.outcome.case
            : undefined;
        if (
          testCase.input.case !== "celSource" ||
          testCase.operation !== ConformanceOperation.TRANSLATE ||
          !databaseProfileNames.has(expectation.profile?.name ?? "") ||
          outcome === undefined ||
          outcome === "valid" ||
          outcome === "predicateProduced"
        ) {
          continue;
        }
        selected.push({
          name: `${suite.name}/${testCase.name}/${expectation.profile!.name}/${expectationIndex}`,
          suite,
          testCase,
          expectation,
        });
      }
    }
  }
  return selected;
}

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
  root: Expr | undefined,
  typeMap: Record<string, Type>,
  declarations: ReadonlySet<string>,
): QueryPath[] {
  const paths = new Map<string, QueryPath>();
  const visit = (expression: Expr | undefined): void => {
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

function selectionComponents(expression: Expr): string[] | undefined {
  const components: string[] = [];
  let current: Expr | undefined = expression;
  while (current?.exprKind.case === "selectExpr") {
    components.unshift(current.exprKind.value.field);
    current = current.exprKind.value.operand;
  }
  if (current?.exprKind.case !== "identExpr") return undefined;
  components.unshift(...current.exprKind.value.name.split("."));
  return components;
}

function expressionChildren(expression: Expr): Expr[] {
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
    case "structExpr": {
      const children: Expr[] = [];
      for (const entry of expression.exprKind.value.entries) {
        if (entry.keyKind.case === "mapKey") children.push(entry.keyKind.value);
        if (entry.value !== undefined) children.push(entry.value);
      }
      return children;
    }
    case "comprehensionExpr":
      return [
        expression.exprKind.value.iterRange,
        expression.exprKind.value.accuInit,
        expression.exprKind.value.loopCondition,
        expression.exprKind.value.loopStep,
        expression.exprKind.value.result,
      ].filter((value): value is Expr => value !== undefined);
    default:
      return [];
  }
}

function constantValues(root: Expr | undefined, typeMap: Record<string, Type>): TypedValue[] {
  const values: TypedValue[] = [];
  const stack = root === undefined ? [] : [root];
  while (stack.length > 0) {
    const expression = stack.pop()!;
    if (expression.exprKind.case === "constExpr") {
      const type = typeMap[expression.id.toString()];
      const kind = expression.exprKind.value.constantKind;
      if (type !== undefined && kind.case !== undefined && kind.case !== "nullValue") {
        values.push({ type, value: kind.value });
      }
    }
    stack.push(...expressionChildren(expression));
  }
  return values;
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
          // The JavaScript CEL runtime cannot evaluate the IEEE-754 maximum as
          // a record value reliably. Exact-output conformance still proves the
          // bound value; differential execution uses finite comparison probes.
          return uniqueValues([
            ...matching.filter(
              (value) => typeof value !== "number" || Math.abs(value) < Number.MAX_VALUE,
            ),
            -1,
            0,
            1,
            1.5,
            22,
            null,
          ]);
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
            "a%_\\z",
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
    case "abstractType":
      // Every spatial binding requires a present stored position, and the
      // domain includes a ring vertex so that closed containment is tested.
      if (type.typeKind.value.name === GeoPointType.typeName()) {
        return [
          new GeoPointValue(0, 0),
          new GeoPointValue(2, 2),
          new GeoPointValue(10, 20),
          new GeoPointValue(30, 40),
          new GeoPointValue(-73.9, 40.7),
          // Positions that reach the antimeridian and a pole, where a distance
          // bound cannot be described by one longitude range.
          new GeoPointValue(179.9, 0.2),
          new GeoPointValue(-179.9, 0.2),
          new GeoPointValue(10, 89.9),
        ];
      }
      // Every full-text binding requires a present indexed value, so the
      // generated domain contains no null.
      if (type.typeKind.value.name === FullTextIndexType.typeName()) {
        return [
          new FullTextIndexValue(["error", "budget"]),
          new FullTextIndexValue(["error"]),
          new FullTextIndexValue(["budget", "other"]),
          // Short and common terms prove that each target's declared index
          // configuration tokenizes the complete query domain.
          new FullTextIndexValue(["a", "the", "error"]),
          new FullTextIndexValue([]),
        ];
      }
      if (type.typeKind.value.name === TimestampRangeType.typeName()) {
        return [
          new TimestampRangeValue(new Timestamp(0n), new Timestamp(946_684_800n)),
          new TimestampRangeValue(new Timestamp(946_684_800n), new Timestamp(1_735_689_600n)),
          new TimestampRangeValue(new Timestamp(1_735_689_600n), new Timestamp(1_735_689_600n)),
          null,
        ];
      }
      return uniqueValues([...matching, null]);
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
      if (typeof child !== "object" || child === null || Array.isArray(child))
        target[component] = {};
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

async function expectPostgreSqlIds(
  client: Client,
  tableName: string,
  paths: QueryPath[],
  records: CandidateRecord[],
  outcome: TranslationOutcome,
  expectedIds: number[],
): Promise<void> {
  const predicate = outcome.case === "predicate" ? outcome.value : undefined;
  const parameters =
    predicate !== undefined && "parameters" in predicate
      ? (predicate.parameters as PostgreSqlParameter[])
      : [];
  const condition =
    outcome.case === "matchAll"
      ? "TRUE"
      : outcome.case === "matchNone"
        ? "FALSE"
        : (predicate as unknown as { sql: string }).sql;
  const columns = paths.map((path) => ({ ...path, name: path.components.join("__") }));
  await client.query(createPostgreSqlTable(tableName, columns));
  try {
    for (const record of records) {
      await client.query(insertPostgreSqlRecord(tableName, columns), [
        record.id,
        ...columns.map((column) =>
          postgreSqlValue(column.type, pathValue(record.value, column.components)),
        ),
      ]);
    }
    const bound = boundPostgreSqlParameters(
      create(PostgreSqlPredicateSchema, { parameters }),
      condition,
    );
    const result = await client.query<{ id: number }>(
      selectPostgreSql(tableName, paths, condition, bound.prefixCount),
      bound.values,
    );
    expect(result.rows.map((row) => row.id)).toEqual(expectedIds);
  } finally {
    await client.query(`DROP TABLE ${quotePostgreSqlIdentifier(tableName)}`);
  }
}

async function expectMySqlIds(
  client: Connection,
  paths: QueryPath[],
  records: CandidateRecord[],
  outcome: TranslationOutcome,
  expectedIds: number[],
): Promise<void> {
  requireMaterializablePaths(paths, "MySQL");
  const columns = paths
    .filter((path) => path.components.length === 1)
    .map((path) => ({ ...path, name: path.components[0]! }));
  // InnoDB rejects a FULLTEXT index on a temporary table, so a full-text
  // fixture uses a base table that this runner drops after the comparison.
  const fullTextColumns = columns.filter((column) => isFullTextIndexType(column.type));
  const temporary = fullTextColumns.length === 0 ? "TEMPORARY " : "";
  const nestedRoots = nestedPaths(paths);
  await client.execute(`DROP ${temporary}TABLE IF EXISTS celql_records`);
  const definitions = columns.map(
    (column) =>
      `${quoteMySqlIdentifier(column.name)} ${mySqlType(column.type)} ${
        isFullTextIndexType(column.type) || isGeoPointType(column.type) ? "NOT NULL" : "NULL"
      }`,
  );
  await client.execute(
    `CREATE ${temporary}TABLE celql_records (${[
      "id INTEGER PRIMARY KEY",
      ...definitions,
      ...fullTextColumns.map((column) => `FULLTEXT (${quoteMySqlIdentifier(column.name)})`),
    ].join(", ")})`,
  );
  for (const [root, nested] of nestedRoots) {
    await client.execute(`DROP TEMPORARY TABLE IF EXISTS ${quoteMySqlIdentifier(root)}`);
    await client.execute(
      `CREATE TEMPORARY TABLE ${quoteMySqlIdentifier(root)} (${[
        "id INTEGER PRIMARY KEY",
        ...nested.map(
          (path) => `${quoteMySqlIdentifier(path.components[1]!)} ${mySqlType(path.type)} NULL`,
        ),
      ].join(", ")})`,
    );
  }
  try {
    const names = ["id", ...columns.map((column) => column.name)].map(quoteMySqlIdentifier);
    // A geometry column reads its value through the same coordinate order the
    // profile emits, so a bound value never becomes SQL syntax.
    const markers = [
      "?",
      ...columns.map((column) =>
        isGeoPointType(column.type) ? "ST_GeomFromText(?, 4326, 'axis-order=long-lat')" : "?",
      ),
    ].join(", ");
    for (const record of records) {
      await client.execute(`INSERT INTO celql_records (${names.join(", ")}) VALUES (${markers})`, [
        record.id,
        ...columns.map((column) =>
          mySqlValue(column.type, pathValue(record.value, column.components)),
        ),
      ] as SqlBinding[]);
      for (const [root, nested] of nestedRoots) {
        await client.execute(
          `INSERT INTO ${quoteMySqlIdentifier(root)} (${["id", ...nested.map((path) => path.components[1]!)].map(quoteMySqlIdentifier).join(", ")}) VALUES (${Array.from({ length: nested.length + 1 }, () => "?").join(", ")})`,
          [
            record.id,
            ...nested.map((path) =>
              mySqlValue(path.type, pathValue(record.value, path.components)),
            ),
          ] as SqlBinding[],
        );
      }
    }
    const predicate =
      outcome.case === "predicate" ? (outcome.value as AnsiSqlPredicate) : undefined;
    const condition =
      outcome.case === "matchAll"
        ? "TRUE"
        : outcome.case === "matchNone"
          ? "FALSE"
          : predicate!.sql;
    const [rows] = await client.execute<RowDataPacket[]>(
      `SELECT celql_records.id FROM celql_records ${[...nestedRoots].map(([root]) => `JOIN ${quoteMySqlIdentifier(root)} USING (id)`).join(" ")} WHERE ${condition} ORDER BY celql_records.id`,
      (predicate?.parameters.map(mySqlParameterValue) ?? []) as SqlBinding[],
    );
    expect(rows.map((row) => row.id as number)).toEqual(expectedIds);
  } finally {
    await client.execute(`DROP ${temporary}TABLE IF EXISTS celql_records`);
    for (const [root] of nestedRoots) {
      await client.execute(`DROP TEMPORARY TABLE IF EXISTS ${quoteMySqlIdentifier(root)}`);
    }
  }
}

/** Reports whether a checked type is the shared opaque position type. */
function isGeoPointType(type: Type): boolean {
  return (
    type.typeKind.case === "abstractType" && type.typeKind.value.name === GeoPointType.typeName()
  );
}

/** Reports whether a checked type is the shared opaque full-text field type. */
function isFullTextIndexType(type: Type): boolean {
  return (
    type.typeKind.case === "abstractType" &&
    type.typeKind.value.name === FullTextIndexType.typeName()
  );
}

function expectSqliteIds(
  database: Database.Database,
  paths: QueryPath[],
  records: CandidateRecord[],
  outcome: TranslationOutcome,
  expectedIds: number[],
): void {
  requireMaterializablePaths(paths, "SQLite");
  database.exec("DROP TABLE IF EXISTS celql_records");
  // An FTS5 field path names its own virtual table, which the query joins by
  // row identifier. It is never a column of the record table.
  const fullTextTables = paths
    .filter((path) => isFullTextIndexType(path.type))
    .map((path) => ({ ...path, name: path.components.join("__") }));
  const columns = paths
    .filter((path) => path.components.length === 1 && !isFullTextIndexType(path.type))
    .map((path) => ({ ...path, name: path.components[0]! }));
  const nestedRoots = nestedPaths(paths.filter((path) => !isFullTextIndexType(path.type)));
  for (const table of fullTextTables) {
    database.exec(`DROP TABLE IF EXISTS ${quotePostgreSqlIdentifier(table.name)}`);
    database.exec(
      `CREATE VIRTUAL TABLE ${quotePostgreSqlIdentifier(table.name)} USING fts5(terms, tokenize='ascii')`,
    );
  }
  const definitions = columns.map(
    (column) => `${quotePostgreSqlIdentifier(column.name)} ${sqliteType(column.type)} NULL`,
  );
  database.exec(
    `CREATE TABLE celql_records (${["id INTEGER PRIMARY KEY", ...definitions].join(", ")})`,
  );
  for (const [root, nested] of nestedRoots) {
    database.exec(`DROP TABLE IF EXISTS ${quotePostgreSqlIdentifier(root)}`);
    database.exec(
      `CREATE TABLE ${quotePostgreSqlIdentifier(root)} (${[
        "id INTEGER PRIMARY KEY",
        ...nested.map(
          (path) =>
            `${quotePostgreSqlIdentifier(path.components[1]!)} ${sqliteType(path.type)} NULL`,
        ),
      ].join(", ")})`,
    );
  }
  try {
    const names = ["id", ...columns.map((column) => column.name)].map(quotePostgreSqlIdentifier);
    const insert = database.prepare(
      `INSERT INTO celql_records (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
    );
    for (const record of records) {
      insert.run(
        record.id,
        ...columns.map((column) =>
          sqliteValue(column.type, pathValue(record.value, column.components)),
        ),
      );
      for (const table of fullTextTables) {
        const value = pathValue(record.value, table.components) as FullTextIndexValue;
        database
          .prepare(
            `INSERT INTO ${quotePostgreSqlIdentifier(table.name)} (rowid, terms) VALUES (?, ?)`,
          )
          .run(record.id, value.terms.join(" "));
      }
      for (const [root, nested] of nestedRoots) {
        database
          .prepare(
            `INSERT INTO ${quotePostgreSqlIdentifier(root)} (${["id", ...nested.map((path) => path.components[1]!)].map(quotePostgreSqlIdentifier).join(", ")}) VALUES (${Array.from({ length: nested.length + 1 }, () => "?").join(", ")})`,
          )
          .run(
            record.id,
            ...nested.map((path) =>
              sqliteValue(path.type, pathValue(record.value, path.components)),
            ),
          );
      }
    }
    const predicate =
      outcome.case === "predicate" ? (outcome.value as AnsiSqlPredicate) : undefined;
    const condition =
      outcome.case === "matchAll"
        ? "TRUE"
        : outcome.case === "matchNone"
          ? "FALSE"
          : predicate!.sql;
    const joins = [
      ...[...nestedRoots].map(([root]) => `JOIN ${quotePostgreSqlIdentifier(root)} USING (id)`),
      ...fullTextTables.map(
        (table) =>
          `JOIN ${quotePostgreSqlIdentifier(table.name)} ON ${quotePostgreSqlIdentifier(
            table.name,
          )}.rowid = celql_records.id`,
      ),
    ];
    const ids = database
      .prepare(
        `SELECT celql_records.id FROM celql_records ${joins.join(" ")} WHERE ${condition} ORDER BY celql_records.id`,
      )
      .all(
        ...(predicate?.parameters.map((parameter) =>
          sqliteValue(parameter.celType!, parameterValue(parameter)),
        ) ?? []),
      )
      .map((row) => (row as { id: number }).id);
    expect(ids).toEqual(expectedIds);
  } finally {
    database.exec("DROP TABLE IF EXISTS celql_records");
    for (const [root] of nestedRoots)
      database.exec(`DROP TABLE IF EXISTS ${quotePostgreSqlIdentifier(root)}`);
    for (const table of fullTextTables)
      database.exec(`DROP TABLE IF EXISTS ${quotePostgreSqlIdentifier(table.name)}`);
  }
}

async function expectMongoDbIds(
  client: MongoClient,
  paths: QueryPath[],
  records: CandidateRecord[],
  outcome: TranslationOutcome,
  _expectedIds: number[],
): Promise<void> {
  const eligibleRecords = records.filter((record) =>
    paths.every((path) => pathValue(record.value, path.components) !== null),
  );
  const collection = client.db("celql").collection<Document>("celql_records");
  const fullTextPaths = paths.filter((path) => isFullTextIndexType(path.type));
  // A $text search uses the collection's single text index. The library's
  // storage contract requires that index to cover exactly the mapped field and
  // to apply no language rules.
  await collection.dropIndexes();
  for (const path of fullTextPaths) {
    await collection.createIndex(
      { [path.components.join(".")]: "text" },
      { default_language: "none" },
    );
  }
  for (const path of paths.filter((candidate) => isGeoPointType(candidate.type))) {
    await collection.createIndex({ [path.components.join(".")]: "2dsphere" });
  }
  await collection.deleteMany({});
  if (eligibleRecords.length > 0) {
    await collection.insertMany(
      eligibleRecords.map(
        (record) =>
          mongoValue({
            id: record.id,
            ...documentValue(record.value, paths),
          }) as Document,
      ),
    );
  }
  const filter =
    outcome.case === "matchAll"
      ? {}
      : outcome.case === "matchNone"
        ? { _id: { $exists: false } }
        : (mongoDbFilter(outcome.value as MongoDbPredicate) as Document);
  const actualIds = (
    await collection
      .find(filter, { projection: { _id: 0, id: 1 } })
      .maxTimeMS(5_000)
      .sort({ id: 1 })
      .toArray()
  ).map((record) => record.id as number);
  const eligibleIds = new Set(eligibleRecords.map((record) => record.id));
  expect(actualIds).toEqual(_expectedIds.filter((id) => eligibleIds.has(id)));
}

/** Stores an indexed term set as the text that MongoDB's text index tokenizes. */
function documentValue(
  value: Record<string, unknown>,
  paths: QueryPath[],
): Record<string, unknown> {
  const document = structuredCloneRecord(value);
  for (const path of paths) {
    const stored = storedValue(path.type, pathValue(value, path.components));
    if (stored === undefined) continue;
    let target = document;
    for (const component of path.components.slice(0, -1)) {
      target = target[component] as Record<string, unknown>;
    }
    target[path.components.at(-1)!] = stored;
  }
  return document;
}

/** Converts one opaque library value to the BSON shape its storage contract requires. */
function storedValue(type: Type, value: unknown): unknown {
  if (isFullTextIndexType(type)) return (value as FullTextIndexValue).terms.join(" ");
  if (isGeoPointType(type)) {
    const point = value as GeoPointValue;
    return { type: "Point", coordinates: [point.longitude, point.latitude] };
  }
  return undefined;
}

function structuredCloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      item !== null && typeof item === "object" && item.constructor === Object
        ? structuredCloneRecord(item as Record<string, unknown>)
        : item,
    ]),
  );
}

function requireMaterializablePaths(paths: QueryPath[], target: string): void {
  const nested = paths.find((path) => path.components.length > 2);
  if (nested !== undefined) {
    throw new Error(`${target} conformance cannot materialize ${nested.components.join(".")}.`);
  }
}

function nestedPaths(paths: QueryPath[]): Map<string, QueryPath[]> {
  const roots = new Map<string, QueryPath[]>();
  for (const path of paths.filter((candidate) => candidate.components.length === 2)) {
    const root = path.components[0]!;
    roots.set(root, [...(roots.get(root) ?? []), path]);
  }
  return roots;
}

function typedParameterValue(parameter: PostgreSqlParameter): TypedValue {
  return { type: parameter.celType!, value: parameterValue(parameter) };
}

function mySqlParameterValue(parameter: AnsiSqlParameter): unknown {
  return mySqlValue(parameter.celType!, parameterValue(parameter));
}

function boundPostgreSqlParameters(
  predicate: PostgreSqlPredicate,
  condition: string,
): { prefixCount: number; values: unknown[] } {
  const positions = [...condition.matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
  const firstPosition = positions.length === 0 ? 1 : Math.min(...positions);
  return {
    prefixCount: firstPosition - 1,
    values: [
      ...Array.from({ length: firstPosition - 1 }, () => null),
      ...postgreSqlParameters(predicate),
    ],
  };
}

function createPostgreSqlTable(
  tableName: string,
  columns: Array<QueryPath & { name: string }>,
): string {
  const definitions = columns.map(
    (column) => `${quotePostgreSqlIdentifier(column.name)} ${postgreSqlType(column.type)}`,
  );
  return `CREATE TEMPORARY TABLE ${quotePostgreSqlIdentifier(tableName)} (${[
    '"id" INTEGER PRIMARY KEY',
    ...definitions,
  ].join(", ")})`;
}

function insertPostgreSqlRecord(
  tableName: string,
  columns: Array<QueryPath & { name: string }>,
): string {
  const names = ["id", ...columns.map((column) => column.name)].map(quotePostgreSqlIdentifier);
  return `INSERT INTO ${quotePostgreSqlIdentifier(tableName)} (${names.join(", ")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(", ")})`;
}

function selectPostgreSql(
  tableName: string,
  paths: QueryPath[],
  condition: string,
  prefixCount: number,
): string {
  const nestedRoots = new Map<string, QueryPath[]>();
  for (const path of paths.filter((candidate) => candidate.components.length > 1)) {
    const root = path.components[0]!;
    nestedRoots.set(root, [...(nestedRoots.get(root) ?? []), path]);
  }
  const lateralJoins = [...nestedRoots].map(([root, nestedPaths]) => {
    const fields = nestedPaths.map((path) => {
      if (path.components.length !== 2) {
        throw new Error(`PostgreSQL conformance cannot materialize ${path.components.join(".")}.`);
      }
      return `${quotePostgreSqlIdentifier(path.components.join("__"))} AS ${quotePostgreSqlIdentifier(path.components[1]!)}`;
    });
    return `CROSS JOIN LATERAL (SELECT ${fields.join(", ")}) AS ${quotePostgreSqlIdentifier(root)}`;
  });
  const prefix =
    prefixCount === 0
      ? ""
      : `WITH ignored_parameters AS (SELECT ${Array.from({ length: prefixCount }, (_, index) => `$${index + 1}::text`).join(", ")}) `;
  return `${prefix}SELECT "id" FROM ${quotePostgreSqlIdentifier(tableName)} ${lateralJoins.join(" ")} WHERE ${condition} ORDER BY "id"`;
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
    case "abstractType":
      return type.typeKind.value.name === TimestampRangeType.typeName()
        ? "TSTZRANGE"
        : type.typeKind.value.name === FullTextIndexType.typeName()
          ? "TSVECTOR"
          : "TEXT";
    default:
      return "TEXT";
  }
}

function mySqlType(type: Type): string {
  if (isGeoPointType(type)) return "POINT SRID 4326";
  if (type.typeKind.case === "listType") return "JSON";
  if (type.typeKind.case === "wellKnown") return "DECIMAL(30, 9)";
  if (type.typeKind.case !== "primitive") return "TEXT";
  return (
    (
      {
        [Type_PrimitiveType.BOOL]: "BOOLEAN",
        [Type_PrimitiveType.INT64]: "BIGINT",
        [Type_PrimitiveType.UINT64]: "BIGINT UNSIGNED",
        [Type_PrimitiveType.DOUBLE]: "DOUBLE",
        [Type_PrimitiveType.STRING]: "TEXT",
        [Type_PrimitiveType.BYTES]: "BLOB",
      } as Record<number, string>
    )[type.typeKind.value] ?? "TEXT"
  );
}

function sqliteType(type: Type): string {
  if (type.typeKind.case === "listType") return "TEXT";
  if (type.typeKind.case === "wellKnown") return "INTEGER";
  if (type.typeKind.case !== "primitive") return "TEXT";
  return type.typeKind.value === Type_PrimitiveType.DOUBLE
    ? "REAL"
    : type.typeKind.value === Type_PrimitiveType.STRING
      ? "TEXT"
      : type.typeKind.value === Type_PrimitiveType.BYTES
        ? "BLOB"
        : "INTEGER";
}

function postgreSqlValue(type: Type, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (type.typeKind.case === "listType") {
    const elementType = type.typeKind.value.elemType;
    return elementType === undefined
      ? value
      : (value as unknown[]).map((element) => postgreSqlValue(elementType, element));
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
  if (
    type.typeKind.case === "abstractType" &&
    type.typeKind.value.name === TimestampRangeType.typeName()
  ) {
    const range = value as TimestampRangeValue;
    return `[${databaseTimestamp(range.start)},${databaseTimestamp(range.end)})`;
  }
  if (
    type.typeKind.case === "abstractType" &&
    type.typeKind.value.name === FullTextIndexType.typeName()
  ) {
    return (value as FullTextIndexValue).terms.join(" ");
  }
  return value;
}

function sqlValue(type: Type, value: unknown): SqlBinding {
  if (value === null || value === undefined) return null;
  if (
    type.typeKind.case === "primitive" &&
    (type.typeKind.value === Type_PrimitiveType.INT64 ||
      type.typeKind.value === Type_PrimitiveType.UINT64)
  ) {
    return (value as bigint).toString();
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new Error("SQL conformance cannot bind this value type.");
}

function mySqlValue(type: Type, value: unknown): SqlBinding {
  if (value === null || value === undefined) return null;
  if (type.typeKind.case === "listType") return JSON.stringify(value);
  // A FULLTEXT column stores the indexed terms as text that the server tokenizes.
  if (isFullTextIndexType(type)) return (value as FullTextIndexValue).terms.join(" ");
  if (isGeoPointType(type)) return geoPointText(value as GeoPointValue);
  if (type.typeKind.case === "wellKnown") {
    const nanoseconds = temporalNanoseconds(value);
    const sign = nanoseconds < 0n ? "-" : "";
    const magnitude = nanoseconds < 0n ? -nanoseconds : nanoseconds;
    return `${sign}${magnitude / 1_000_000_000n}.${(magnitude % 1_000_000_000n)
      .toString()
      .padStart(9, "0")}`;
  }
  return sqlValue(type, value);
}

function sqliteValue(type: Type, value: unknown): SqlBinding {
  if (value !== null && value !== undefined && type.typeKind.case === "listType") {
    return JSON.stringify(value);
  }
  if (value !== null && value !== undefined && type.typeKind.case === "wellKnown") {
    return temporalNanoseconds(value);
  }
  const result = sqlValue(type, value);
  return typeof result === "boolean" ? Number(result) : result;
}

function temporalNanoseconds(value: unknown): bigint {
  const temporal = value as { seconds: bigint; nanos: number };
  return temporal.seconds * 1_000_000_000n + BigInt(temporal.nanos);
}

function mongoValue(value: unknown): unknown {
  if (typeof value === "bigint") return Long.fromBigInt(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(mongoValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        mongoValue(item),
      ]),
    );
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
    case "abstractType":
      return `abstract:${type.typeKind.value.name}`;
    default:
      return type.typeKind.case ?? "unknown";
  }
}

function databaseTimestamp(timestamp: Timestamp): string {
  return new Date(Number(timestamp.seconds()) * 1000 + timestamp.nanos() / 1_000_000).toISOString();
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

function quotePostgreSqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteMySqlIdentifier(value: string): string {
  return `\`${value.replaceAll("`", "``")}\``;
}
