import { create, type MessageShape } from "@bufbuild/protobuf";
import { astToCheckedExpr, BoolType, env, variable } from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import { AnsiSqlPredicateSchema } from "./gen/protoutil/celql/ansisql/v1/ansisql_pb.js";
import {
  AbsenceSemantics,
  DialectCapabilityProfileSchema,
  type LibraryReference,
  LibraryReferenceSchema,
  NullSemantics,
  OperandShape,
  OperationCapabilitySchema,
  OutputGrowthUnit,
  ParameterStyle,
  ProfileReferenceSchema,
  RegexSupport,
  TranslationErrorCode,
  TranslationLimitsSchema,
} from "./gen/protoutil/celql/v1/celql_pb.js";
import { createTranslator } from "./translator.js";
import type { Profile, ProfileContext, TranslationFunction, TranslationLibrary } from "./types.js";

const checkedFlag = astToCheckedExpr(
  env({ variables: [variable("flag", BoolType)] }).compile("flag"),
);

type TestTranslation = (context: ProfileContext) => string;

function customProfile(
  options: {
    name?: string;
    outputTypeName?: string;
    validate?: (context: ProfileContext) => void;
    translate?: (
      context: ProfileContext,
      functions: ReadonlyMap<string, TestTranslation>,
    ) => MessageShape<typeof AnsiSqlPredicateSchema>;
  } = {},
): Profile<typeof AnsiSqlPredicateSchema, TestTranslation> {
  const capability = create(DialectCapabilityProfileSchema, {
    profile: {
      name: options.name ?? "example.custom",
      majorVersion: 1,
    },
    outputTypeName: options.outputTypeName ?? "protoutil.celql.ansisql.v1.AnsiSqlPredicate",
    supportedCelTypes: ["bool"],
    nullSemantics: NullSemantics.REJECTED,
    absenceSemantics: AbsenceSemantics.REJECTED,
    regexSupport: RegexSupport.NONE,
    parameterStyle: ParameterStyle.NONE,
    outputGrowthUnit: OutputGrowthUnit.CHARACTERS,
    defaultMaxOutputGrowth: 128n,
    defaultLimits: create(TranslationLimitsSchema, {
      maxDepth: 8,
      maxNodes: 32n,
      maxParameters: 8n,
      maxConstantBytes: 128n,
      maxTotalConstantBytes: 512n,
      maxComprehensionNesting: 1,
      maxRegexPatternBytes: 1n,
      maxOutputGrowth: 128n,
    }),
  });

  return {
    capability,
    outputSchema: AnsiSqlPredicateSchema,
    validate: (context) => options.validate?.(context),
    translate: (context, functions) =>
      options.translate?.(context, functions) ??
      create(AnsiSqlPredicateSchema, { sql: '"flag" = TRUE' }),
  };
}

function translationFunction(overloadId: string): TranslationFunction<TestTranslation> {
  return {
    capability: create(OperationCapabilitySchema, {
      overloadId,
      operands: [
        {
          celType: "bool",
          allowedShapes: [OperandShape.QUERY_FIELD_PATH],
        },
      ],
      resultType: "bool",
    }),
    translate: () => overloadId,
  };
}

function library(
  name: string,
  options: {
    majorVersion?: number;
    profileName?: string;
    functions?: readonly TranslationFunction<TestTranslation>[];
    requiredTranslationLibraries?: readonly LibraryReference[];
  } = {},
): TranslationLibrary<TestTranslation> {
  return {
    compileOptions: {},
    programOptions: {},
    libraryName: name,
    libraryVersion: options.majorVersion ?? 1,
    reference: create(LibraryReferenceSchema, {
      name,
      majorVersion: options.majorVersion ?? 1,
    }),
    profile: create(ProfileReferenceSchema, {
      name: options.profileName ?? "example.custom",
      majorVersion: 1,
    }),
    requiredTranslationLibraries: options.requiredTranslationLibraries ?? [],
    functions: options.functions ?? [translationFunction(`${name}.call`)],
  };
}

describe("translation libraries", () => {
  it("materializes selected libraries and their operations into the effective capability", () => {
    const second = library("example.second");
    const first = library("example.first");
    const translator = createTranslator(customProfile(), { libraries: [second, first] });

    expect(translator.capability().libraries).toMatchObject([
      { name: "example.first", majorVersion: 1 },
      { name: "example.second", majorVersion: 1 },
    ]);
    expect(translator.capability().operations.map(({ overloadId }) => overloadId)).toEqual([
      "example.first.call",
      "example.second.call",
    ]);
  });

  it("materializes the same singleton library once", () => {
    const selected = library("example.singleton");
    const translator = createTranslator(customProfile(), {
      libraries: [selected, selected],
    });

    expect(translator.capability().libraries).toHaveLength(1);
    expect(translator.capability().operations).toHaveLength(1);
  });

  it("rejects conflicting definitions for one library reference", () => {
    const first = library("example.singleton", {
      functions: [translationFunction("example.singleton.first")],
    });
    const second = library("example.singleton", {
      functions: [translationFunction("example.singleton.second")],
    });

    expect(() => createTranslator(customProfile(), { libraries: [first, second] })).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.INVALID_LIBRARY_CONFIGURATION }),
    );
  });

  it("makes library order irrelevant to capability and translation", () => {
    const first = library("example.first");
    const second = library("example.second");
    const profile = customProfile({
      translate: (_context, functions) =>
        create(AnsiSqlPredicateSchema, { sql: [...functions.keys()].join(",") }),
    });

    const forward = createTranslator(profile, { libraries: [first, second] });
    const reverse = createTranslator(profile, { libraries: [second, first] });

    expect(reverse.capability()).toEqual(forward.capability());
    expect(reverse.translate({ checkedExpression: checkedFlag })).toEqual(
      forward.translate({ checkedExpression: checkedFlag }),
    );
  });

  it("rejects different major versions under one library name", () => {
    expect(() =>
      createTranslator(customProfile(), {
        libraries: [
          library("example.conflict", { majorVersion: 1 }),
          library("example.conflict", { majorVersion: 2 }),
        ],
      }),
    ).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.INVALID_LIBRARY_CONFIGURATION }),
    );
  });

  it("rejects different CEL and translation-library identities", () => {
    const selected = library("example.identity");

    expect(() =>
      createTranslator(customProfile(), {
        libraries: [{ ...selected, libraryName: "example.other" }],
      }),
    ).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.INVALID_LIBRARY_CONFIGURATION }),
    );
  });

  it("rejects a missing required library", () => {
    const required = create(LibraryReferenceSchema, {
      name: "example.required",
      majorVersion: 1,
    });

    expect(() =>
      createTranslator(customProfile(), {
        libraries: [library("example.dependent", { requiredTranslationLibraries: [required] })],
      }),
    ).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.INVALID_LIBRARY_CONFIGURATION }),
    );
  });

  it("rejects an overload owned by two libraries", () => {
    const shared = translationFunction("example.shared");

    expect(() =>
      createTranslator(customProfile(), {
        libraries: [
          library("example.first", { functions: [shared] }),
          library("example.second", { functions: [shared] }),
        ],
      }),
    ).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.INVALID_LIBRARY_CONFIGURATION }),
    );
  });

  it("rejects a library overload already owned by the profile", () => {
    const profile = customProfile();
    profile.capability.operations.push(translationFunction("example.shared").capability);

    expect(() =>
      createTranslator(profile, {
        libraries: [
          library("example.library", {
            functions: [translationFunction("example.shared")],
          }),
        ],
      }),
    ).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.INVALID_LIBRARY_CONFIGURATION }),
    );
  });

  it("rejects a library binding for another profile", () => {
    expect(() =>
      createTranslator(customProfile(), {
        libraries: [library("example.other", { profileName: "example.other-profile" })],
      }),
    ).toThrow(
      expect.objectContaining({ code: TranslationErrorCode.INVALID_LIBRARY_CONFIGURATION }),
    );
  });
});
