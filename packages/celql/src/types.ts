import type { DescMessage, Message, MessageShape } from "@bufbuild/protobuf";
import type { Any } from "@bufbuild/protobuf/wkt";
import type { LibraryVersioner, SingletonLibrary } from "@protoutil/cel";
import type { CheckedExpr } from "./gen/cel/expr/checked_pb.js";
import type {
  DialectCapabilityProfile,
  LibraryReference,
  OperationCapability,
  ProfileReference,
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

/** Fully resolved finite limits supplied to a profile. */
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

/** Common validated input passed to a profile. */
export interface ProfileContext {
  /** Structurally valid checked expression with a Boolean root. */
  readonly checkedExpression: CheckedExpr;

  /** Effective finite limits for this operation. */
  readonly limits: EffectiveTranslationLimits;

  /** Trusted profile configuration supplied by the caller. */
  readonly profileConfiguration?: Any;
}

/**
 * Target-independent CEL declarations and evaluation bindings of one library.
 *
 * A CEL library defines what an expression means. A `TranslationLibrary` adds
 * the target binding that preserves that meaning for one profile.
 */
export type CelLibrary = SingletonLibrary & LibraryVersioner;

/** One profile-specific translation function contributed by a library. */
export interface TranslationFunction<Translation> {
  /** Machine-readable declaration for the resolved overload. */
  readonly capability: OperationCapability;

  /** Target-compatible translation selected for that overload. */
  readonly translate: Translation;
}

/** One named singleton addition to a profile's translatable fragment. */
export interface TranslationLibrary<Translation> extends CelLibrary {
  /** Stable semantic library identity. */
  readonly reference: LibraryReference;

  /** Profile name and major version supported by this library binding. */
  readonly profile: ProfileReference;

  /** Versioned translation libraries that the caller must also select. */
  readonly requiredTranslationLibraries?: readonly LibraryReference[];

  /** Resolved overload declarations and their target translations. */
  readonly functions: readonly TranslationFunction<Translation>[];
}

/** A profile implementation for one profile major version. */
export interface Profile<Desc extends DescMessage = DescMessage, Translation = unknown> {
  /** Machine-readable base capability declaration for the profile. */
  readonly capability: DialectCapabilityProfile;

  /** Protobuf schema of the profile's sole predicate output type. */
  readonly outputSchema: Desc;

  /** Validates trusted profile configuration before any translation outcome is selected. */
  readonly validateConfiguration?: (profileConfiguration?: Any) => void;

  /** Verifies one expression through this constructed profile and its selected libraries. */
  readonly validate: (context: ProfileContext, functions: ReadonlyMap<string, Translation>) => void;

  /** Produces one complete predicate through this constructed profile and its selected libraries. */
  readonly translate: (
    context: ProfileContext,
    functions: ReadonlyMap<string, Translation>,
  ) => MessageShape<Desc>;
}

/** Options applied once when a translator materializes its profile. */
export interface CreateTranslatorOptions<Translation> {
  /** Named translation libraries added to the profile. */
  readonly libraries?: readonly TranslationLibrary<Translation>[];
}

/** Protobuf descriptor for the predicate type produced by a selected profile. */
export type ProfileOutput<SelectedProfile extends { outputSchema: DescMessage }> =
  SelectedProfile["outputSchema"];

/** Successful translation result. */
export type TranslationOutcome<T extends Message = Message> =
  /** The expression is unconditionally true. */
  | { case: "matchAll" }
  /** The expression is unconditionally false. */
  | { case: "matchNone" }
  /** The selected profile produced one complete predicate. */
  | { case: "predicate"; value: T };
