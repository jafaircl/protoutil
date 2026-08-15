import { create, type MessageShape } from "@bufbuild/protobuf";
import { astToCheckedExpr, BoolType, env, variable } from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import { AnsiSqlPredicateSchema, AnsiSqlProfile } from "./ansisql/index.js";
import {
  AbsenceSemantics,
  createTranslator,
  DialectCapabilityProfileSchema,
  NullSemantics,
  OutputGrowthUnit,
  ParameterStyle,
  type Profile,
  type ProfileContext,
  RegexSupport,
  TranslationErrorCode,
  TranslationLimitsSchema,
} from "./index.js";

const checkedFlag = astToCheckedExpr(
  env({ variables: [variable("flag", BoolType)] }).compile("flag"),
);

function customProfile(
  options: {
    name?: string;
    outputTypeName?: string;
    validate?: (context: ProfileContext) => void;
    translate?: (context: ProfileContext) => MessageShape<typeof AnsiSqlPredicateSchema>;
  } = {},
): Profile<typeof AnsiSqlPredicateSchema, never> {
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
    translate: (context) =>
      options.translate?.(context) ?? create(AnsiSqlPredicateSchema, { sql: '"flag" = TRUE' }),
  };
}

describe("CelqlTranslator", () => {
  it("binds the caller-supplied ANSI SQL profile", () => {
    const translator = createTranslator(new AnsiSqlProfile());

    expect(translator.capability().profile).toMatchObject({
      name: "protoutil.celql.ansisql",
      majorVersion: 1,
    });
  });

  it("uses an extended built-in profile directly", () => {
    class ParenthesizedAnsiSqlProfile extends AnsiSqlProfile {
      public override translate(
        ...args: Parameters<AnsiSqlProfile["translate"]>
      ): ReturnType<AnsiSqlProfile["translate"]> {
        const predicate = super.translate(...args);
        predicate.sql = `(${predicate.sql})`;
        return predicate;
      }
    }

    const translator = createTranslator(new ParenthesizedAnsiSqlProfile());

    expect(translator.translate({ checkedExpression: checkedFlag })).toMatchObject({
      case: "predicate",
      value: { sql: '("flag" = TRUE)' },
    });
  });

  it("translates through its bound custom profile", () => {
    const translator = createTranslator(customProfile());

    const result = translator.translate({
      checkedExpression: checkedFlag,
    });

    expect(result).toEqual({
      case: "predicate",
      value: expect.objectContaining({
        $typeName: "protoutil.celql.ansisql.v1.AnsiSqlPredicate",
        sql: '"flag" = TRUE',
      }),
    });
  });

  it("validates through its bound profile without returning an outcome", () => {
    let validations = 0;
    const translator = createTranslator(
      customProfile({
        validate: () => {
          validations += 1;
        },
      }),
    );

    expect(translator.validate({ checkedExpression: checkedFlag })).toBeUndefined();
    expect(validations).toBe(1);
  });

  it("rejects output whose protobuf type differs from the capability", () => {
    const translator = createTranslator(
      customProfile({ outputTypeName: "example.ExpectedPredicate" }),
    );

    expect(() =>
      translator.translate({
        checkedExpression: checkedFlag,
      }),
    ).toThrow(expect.objectContaining({ code: TranslationErrorCode.INVALID_PROFILE_OUTPUT }));
  });

  it("throws when a profile fails unrecoverably", () => {
    const translator = createTranslator(
      customProfile({
        translate: () => {
          throw new Error("profile defect");
        },
      }),
    );

    expect(() =>
      translator.translate({
        checkedExpression: checkedFlag,
      }),
    ).toThrow("profile defect");
  });

  it("uses separate translators for separate profiles", () => {
    const first = createTranslator(customProfile({ name: "example.first" }));
    const second = createTranslator(customProfile({ name: "example.second" }));

    expect(first.capability().profile?.name).toBe("example.first");
    expect(second.capability().profile?.name).toBe("example.second");
  });

  it("requires the caller to provide a profile", () => {
    expect(() => createTranslator(undefined as never)).toThrow("a profile is required");
  });
});
