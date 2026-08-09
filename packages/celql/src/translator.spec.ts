import { create, type MessageShape } from "@bufbuild/protobuf";
import { astToCheckedExpr, BoolType, env, variable } from "@protoutil/cel";
import { describe, expect, it } from "vitest";
import {
  AbsenceSemantics,
  AnsiSqlDialect,
  AnsiSqlPredicateSchema,
  createTranslator,
  Dialect,
  DialectCapabilityProfileSchema,
  type DialectConstructor,
  type DialectContext,
  NullSemantics,
  OutputGrowthUnit,
  ParameterStyle,
  RegexSupport,
  TranslationErrorCode,
  TranslationLimitsSchema,
} from "./index.js";

const checkedFlag = astToCheckedExpr(
  env({ variables: [variable("flag", BoolType)] }).compile("flag"),
);

function customDialect(
  options: {
    name?: string;
    outputTypeName?: string;
    validate?: (context: DialectContext) => void;
    translate?: (context: DialectContext) => MessageShape<typeof AnsiSqlPredicateSchema>;
  } = {},
): DialectConstructor<typeof AnsiSqlPredicateSchema> {
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

  return class CustomDialect extends Dialect<typeof AnsiSqlPredicateSchema> {
    public static readonly capability = capability;
    public static readonly outputSchema = AnsiSqlPredicateSchema;

    public override validate(): void {
      if (options.validate === undefined) {
        super.validate();
        return;
      }
      options.validate(this.context);
    }

    public translate(): MessageShape<typeof AnsiSqlPredicateSchema> {
      return (
        options.translate?.(this.context) ??
        create(AnsiSqlPredicateSchema, { sql: '"flag" = TRUE' })
      );
    }
  };
}

describe("CelqlTranslator", () => {
  it("binds the caller-supplied ANSI SQL dialect", () => {
    const translator = createTranslator(AnsiSqlDialect);

    expect(translator.capability().profile).toMatchObject({
      name: "protoutil.celql.ansisql",
      majorVersion: 1,
    });
  });

  it("translates through its bound custom dialect", () => {
    const translator = createTranslator(customDialect());

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

  it("validates through its bound dialect without returning an outcome", () => {
    let validations = 0;
    const translator = createTranslator(
      customDialect({
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
      customDialect({ outputTypeName: "example.ExpectedPredicate" }),
    );

    expect(() =>
      translator.translate({
        checkedExpression: checkedFlag,
      }),
    ).toThrow(expect.objectContaining({ code: TranslationErrorCode.INVALID_PROFILE_OUTPUT }));
  });

  it("throws when a dialect fails unrecoverably", () => {
    const translator = createTranslator(
      customDialect({
        translate: () => {
          throw new Error("dialect defect");
        },
      }),
    );

    expect(() =>
      translator.translate({
        checkedExpression: checkedFlag,
      }),
    ).toThrow("dialect defect");
  });

  it("uses separate translators for separate dialects", () => {
    const first = createTranslator(customDialect({ name: "example.first" }));
    const second = createTranslator(customDialect({ name: "example.second" }));

    expect(first.capability().profile?.name).toBe("example.first");
    expect(second.capability().profile?.name).toBe("example.second");
  });

  it("requires the caller to provide a dialect class", () => {
    expect(() => createTranslator(undefined as never)).toThrow("a dialect class is required");
  });
});
