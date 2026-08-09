import type { DescMessage, Message, MessageShape } from "@bufbuild/protobuf";
import type { Any } from "@bufbuild/protobuf/wkt";
import type { CheckedExpr } from "./gen/cel/expr/checked_pb.js";
import type {
  DialectCapabilityProfile,
  TranslationLimits,
} from "./gen/protoutil/celql/v1/celql_pb.js";

/** Input for one translation or validation operation. */
export interface TranslationRequest {
  /** Checked CEL expression to process. */
  checkedExpression: CheckedExpr;

  /** Per-operation limits that replace the selected profile's defaults. */
  limits?: TranslationLimits;

  /** Trusted configuration interpreted by the selected profile. */
  profileConfiguration?: Any;
}

/** Fully resolved finite limits supplied to a dialect profile. */
export interface EffectiveTranslationLimits {
  /** Maximum reachable expression-tree depth, with the root at depth one. */
  maxDepth: number;

  /** Maximum number of reachable expression nodes. */
  maxNodes: bigint;

  /** Maximum number of parameters the profile can emit. */
  maxParameters: bigint;

  /** Maximum encoded value size of one CEL constant. */
  maxConstantBytes: bigint;

  /** Maximum encoded value size of all reachable CEL constants. */
  maxTotalConstantBytes: bigint;

  /** Maximum nested comprehension depth. */
  maxComprehensionNesting: number;

  /** Maximum encoded regular-expression pattern size. */
  maxRegexPatternBytes: bigint;

  /** Maximum output size in the unit declared by the profile. */
  maxOutputGrowth: bigint;
}

/** Common validated input passed to a dialect profile. */
export interface DialectContext {
  /** Structurally valid checked expression with a Boolean root. */
  checkedExpression: CheckedExpr;

  /** Effective finite limits for this operation. */
  limits: EffectiveTranslationLimits;

  /** Trusted profile configuration supplied by the caller. */
  profileConfiguration?: Any;
}

/** Base visitor for one translation through one dialect. */
export abstract class Dialect<Desc extends DescMessage = DescMessage> {
  /** Preserves the concrete output schema through dialect-constructor inference. */
  protected declare readonly dialectOutput: Desc;

  /** Validated input and finite limits for this translation. */
  protected readonly context: DialectContext;

  /** Creates a fresh dialect visitor for one operation. */
  public constructor(context: DialectContext) {
    this.context = context;
  }

  /**
   * Verifies dialect-specific input and configuration.
   *
   * The default implementation performs a complete translation so validation
   * and translation apply identical visitor behavior and rejection rules.
   *
   * @throws CelqlError when the input is outside the dialect contract.
   */
  public validate(): void {
    this.translate();
  }

  /**
   * Produces one complete predicate of the dialect's declared output schema.
   *
   * @throws CelqlError when the input cannot be translated.
   */
  public abstract translate(): MessageShape<Desc>;
}

/** Public constructor and static metadata for one dialect profile major version. */
export interface DialectConstructor<Desc extends DescMessage = DescMessage> {
  /** Machine-readable capability declaration for the dialect profile. */
  readonly capability: DialectCapabilityProfile;

  /** Protobuf schema of the dialect's sole predicate output type. */
  readonly outputSchema: Desc;

  /** Creates an isolated visitor for one validation or translation operation. */
  new (context: DialectContext): Dialect<Desc>;
}

/** Predicate schema produced by instances of a dialect constructor. */
export type DialectOutput<Constructor extends DialectConstructor> = Constructor extends new (
  context: DialectContext,
) => Dialect<infer Desc>
  ? Desc
  : never;

/** Successful translation result. */
export type TranslationOutcome<T extends Message = Message> =
  /** The expression is unconditionally true. */
  | { case: "matchAll" }
  /** The expression is unconditionally false. */
  | { case: "matchNone" }
  /** The selected profile produced one complete predicate. */
  | { case: "predicate"; value: T };
