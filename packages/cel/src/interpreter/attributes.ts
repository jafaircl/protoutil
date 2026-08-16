import { type Container, defaultContainer } from "../common/containers.js";
import {
  type Adapter,
  Bool,
  String as CelString,
  DefaultTypeAdapter,
  Double,
  Err,
  Int,
  Kind,
  type Lister,
  ListType,
  type Mapper,
  Optional,
  OptionalNone,
  optionalOf,
  type Provider,
  type ProviderFieldType,
  type Type,
  Uint,
  Unknown,
  type Val,
} from "../common/types/index.js";
import type { MapValue } from "../common/types/pb/type.js";
import type { FieldTester, Indexer } from "../common/types/traits/index.js";
import { type Activation, activationNameAbsent } from "./activation.js";
import type { ExecutionFrame } from "./frame.js";

/**
 * AttributeFactory provides methods for creating Attribute and Qualifier values.
 */
export interface AttributeFactory {
  /**
   * AbsoluteAttribute creates an attribute that refers to a top-level variable name.
   */
  absoluteAttribute(id: number, ...names: string[]): NamespacedAttribute;

  /**
   * conditionalAttribute creates an attribute with truthy and falsy branches selected by an expression.
   */
  conditionalAttribute(
    id: number,
    expr: { exec(frame: ExecutionFrame): Val; eval(vars: Activation): Val },
    truthy: Attribute,
    falsy: Attribute,
  ): Attribute;

  /**
   * MaybeAttribute creates an attribute that refers to either a field selection or a namespaced
   * variable name.
   */
  maybeAttribute(id: number, name: string): Attribute;

  /**
   * relativeAttribute creates an attribute whose base value comes from a dynamic expression.
   */
  relativeAttribute(
    id: number,
    operand: { exec(frame: ExecutionFrame): Val; eval(vars: Activation): Val },
  ): Attribute;

  /**
   * Qualifier creates a qualifier on the target object with a given value.
   */
  qualifier(options: QualifierOptions): Qualifier;
}

/**
 * Qualifier describes a field selection or index access within an attribute path.
 */
export interface Qualifier {
  /**
   * id returns where the qualifier appears within an expression.
   */
  id(): number;

  /**
   * isOptional returns whether the qualifier was declared as optional.
   */
  isOptional(): boolean;

  /**
   * qualify performs the field or index selection on the input object.
   */
  qualify(vars: Activation, obj: unknown): unknown;

  /**
   * qualifyIfPresent performs the field or index selection only when the field or index is present.
   */
  qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): unknown;
}

/** qualifierAbsent marks a qualification that could not be resolved. */
export const qualifierAbsent = Symbol("qualifierAbsent");

/**
 * ConstantQualifier embeds the Qualifier interface and exposes its constant value.
 */
export interface ConstantQualifier extends Qualifier {
  /**
   * value returns the constant value associated with the qualifier.
   */
  value(): Val;
}

/**
 * Attribute represents a variable or value with an optional set of qualifiers.
 */
export interface Attribute extends Qualifier {
  /**
   * addQualifier appends a qualifier to the attribute path.
   */
  addQualifier(qualifierValue: Qualifier): Attribute;

  /**
   * resolve returns the current value of the attribute within an activation.
   */
  resolve(vars: Activation): unknown;
}

/**
 * NamespacedAttribute is an Attribute whose base variable may have multiple candidate names.
 */
export interface NamespacedAttribute extends Attribute {
  /**
   * candidateVariableNames returns the possible namespaced variable names in CEL resolution order.
   */
  candidateVariableNames(): string[];

  /**
   * qualifiers returns the qualifiers associated with the attribute.
   */
  qualifiers(): Qualifier[];
}

/**
 * QualifierOptions configures qualifier construction.
 */
export interface QualifierOptions {
  /**
   * idValue identifies the qualifier location in the expression tree.
   */
  id: number;

  /**
   * objectType is the statically checked type of the value being qualified.
   */
  objectType?: Type;

  /**
   * value contains the raw constant or attribute value for the qualifier.
   */
  value: unknown;

  /**
   * optional marks the qualifier as optional.
   */
  optional: boolean;
}

/**
 * AttributeFactoryOptions configures attribute factory construction.
 */
export interface AttributeFactoryOptions {
  /**
   * containerValue provides the CEL container used for unchecked candidate-name expansion.
   */
  containerValue?: Container;

  /**
   * adapterValue converts native values to CEL values.
   */
  adapter?: Adapter;

  /**
   * providerValue resolves identifiers that are not regular variables.
   */
  provider?: Provider;

  /**
   * errorOnBadPresenceTest enables cel-go's stricter errors for invalid presence tests.
   */
  errorOnBadPresenceTest?: boolean;
}

/**
 * AppliedQualifiersResult tracks the resolved attribute value and whether optional traversal occurred.
 */
interface AppliedQualifiersResult {
  /**
   * value is the final qualified value or OptionalNone when an optional hop is absent.
   */
  value: unknown;

  /**
   * optional reports whether a qualifier path traversed an optional value or optional qualifier.
   */
  optional: boolean;
}

/**
 * ResolutionError encodes the different error states which may occur during attribute resolution.
 */
export class ResolutionError extends Error {
  /**
   * constructor initializes the resolution error with the relevant missing-path state.
   */
  constructor(
    private readonly missingAttributeValue?: string,
    message = "invalid attribute",
  ) {
    super(message);
  }

  /**
   * isMissingAttribute returns whether the error represents a missing variable or attribute path.
   */
  public isMissingAttribute(): boolean {
    return this.missingAttributeValue !== undefined;
  }
}

/**
 * AttributeFactoryImpl produces the default attribute and qualifier implementations.
 */
class AttributeFactoryImpl implements AttributeFactory {
  /**
   * constructor initializes the shared container, adapter, and provider dependencies.
   */
  constructor(
    private readonly containerValue: Container,
    private readonly adapterValue: Adapter,
    private readonly providerValue: Provider,
    private readonly errorOnBadPresenceTestValue: boolean,
  ) {}

  /**
   * absoluteAttribute creates a namespaced attribute for top-level variable lookup.
   */
  public absoluteAttribute(id: number, ...names: string[]): NamespacedAttribute {
    const normalizedNames = names.map((name) => (name.startsWith(".") ? name.slice(1) : name));
    const disambiguateNames = names.some((name) => name.startsWith("."));
    return new AbsoluteAttributeImpl(
      id,
      normalizedNames,
      disambiguateNames,
      this.providerValue,
      this,
    );
  }

  /**
   * maybeAttribute creates an unchecked attribute that may resolve as a variable or a field path.
   */
  public maybeAttribute(id: number, name: string): Attribute {
    const names = name.startsWith(".") ? [name] : this.containerValue.resolveCandidateNames(name);
    return new MaybeAttributeImpl(id, [this.absoluteAttribute(id, ...names)], this);
  }

  /**
   * conditionalAttribute creates an attribute that resolves one of two branches based on a condition value.
   */
  public conditionalAttribute(
    id: number,
    expr: { exec(frame: ExecutionFrame): Val; eval(vars: Activation): Val },
    truthy: Attribute,
    falsy: Attribute,
  ): Attribute {
    return new ConditionalAttributeImpl(id, expr, truthy, falsy, this);
  }

  /**
   * relativeAttribute creates an attribute rooted at a dynamic expression result.
   */
  public relativeAttribute(
    id: number,
    operand: { exec(frame: ExecutionFrame): Val; eval(vars: Activation): Val },
  ): Attribute {
    return new RelativeAttributeImpl(id, operand, this);
  }

  /**
   * qualifier creates a qualifier implementation for the provided constant or attribute value.
   */
  public qualifier(options: QualifierOptions): Qualifier {
    if (isAttribute(options.value)) {
      return new AttributeQualifierImpl(options.id, options.value, options.optional, this);
    }
    if (typeof options.value === "string") {
      if (options.objectType?.kind() === Kind.Struct) {
        const fieldType = this.providerValue.findStructFieldType(
          options.objectType.typeName(),
          options.value,
        );
        if (fieldType && supportsFieldQualifier(fieldType.type)) {
          return new FieldQualifier({
            adapter: this.adapterValue,
            id: options.id,
            optional: options.optional,
            name: options.value,
            fieldType,
          });
        }
      }
      return new StringQualifier(
        options.id,
        options.optional,
        this.adapterValue,
        options.value,
        undefined,
        this.errorOnBadPresenceTestValue,
      );
    }
    if (typeof options.value === "boolean") {
      return new BoolQualifier(
        options.id,
        options.optional,
        this.adapterValue,
        options.value,
        undefined,
        this.errorOnBadPresenceTestValue,
      );
    }
    if (options.value instanceof CelString) {
      return new StringQualifier(
        options.id,
        options.optional,
        this.adapterValue,
        options.value.value(),
        options.value,
        this.errorOnBadPresenceTestValue,
      );
    }
    if (options.value instanceof Bool) {
      return new BoolQualifier(
        options.id,
        options.optional,
        this.adapterValue,
        options.value.value(),
        options.value,
        this.errorOnBadPresenceTestValue,
      );
    }
    if (options.value instanceof Uint) {
      return new UintQualifier(
        options.id,
        options.optional,
        this.adapterValue,
        options.value.value(),
        options.value,
        this.errorOnBadPresenceTestValue,
      );
    }
    if (options.value instanceof Int) {
      return new IntQualifier(
        options.id,
        options.optional,
        this.adapterValue,
        Number(options.value.value()),
        options.value,
        this.errorOnBadPresenceTestValue,
      );
    }
    if (options.value instanceof Double) {
      return new DoubleQualifier(
        options.id,
        options.optional,
        this.adapterValue,
        options.value.value(),
        options.value,
        this.errorOnBadPresenceTestValue,
      );
    }
    if (typeof options.value === "bigint") {
      return new UintQualifier(
        options.id,
        options.optional,
        this.adapterValue,
        options.value,
        undefined,
        this.errorOnBadPresenceTestValue,
      );
    }
    if (typeof options.value === "number") {
      return Number.isInteger(options.value)
        ? new IntQualifier(
            options.id,
            options.optional,
            this.adapterValue,
            options.value,
            undefined,
            this.errorOnBadPresenceTestValue,
          )
        : new DoubleQualifier(
            options.id,
            options.optional,
            this.adapterValue,
            options.value,
            undefined,
            this.errorOnBadPresenceTestValue,
          );
    }
    if (options.value instanceof Unknown) {
      return new UnknownQualifier(options.id, options.value, options.optional);
    }
    if (isQualifier(options.value)) {
      return options.value;
    }
    throw invalidQualifierType(options.value);
  }
}

/**
 * QualifierBase provides shared id and optional handling for qualifiers.
 */
abstract class QualifierBase implements Qualifier {
  /**
   * constructor initializes the shared qualifier metadata.
   */
  constructor(
    private readonly idValue: number,
    private readonly optionalValue: boolean,
  ) {}

  /**
   * id returns the qualifier expression id.
   */
  public id(): number {
    return this.idValue;
  }

  /**
   * isOptional returns whether the qualifier is optional.
   */
  public isOptional(): boolean {
    return this.optionalValue;
  }

  /**
   * qualifyIfPresent performs qualification only when the field or index exists on the target.
   */
  public qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): unknown {
    try {
      const value = this.qualify(vars, obj);
      if (
        this.isOptional() &&
        value instanceof Err &&
        /out of range|no such key/.test(String(value))
      ) {
        // Optional dynamic indexing treats missing list indices and map keys as absence.
        return qualifierAbsent;
      }
      if (presenceOnly) {
        return undefined;
      }
      return value;
    } catch (error) {
      if (error instanceof ResolutionError) {
        return qualifierAbsent;
      }
      throw error;
    }
  }

  /**
   * qualify performs the qualifier-specific resolution logic.
   */
  public abstract qualify(vars: Activation, obj: unknown): unknown;
}

/**
 * FieldQualifierOptions configures a typed protobuf field qualifier.
 */
interface FieldQualifierOptions {
  /**
   * adapter converts native protobuf field values into their CEL runtime representation.
   */
  adapter: Adapter;

  /**
   * fieldType contains the provider's precomputed presence and value accessors.
   */
  fieldType: ProviderFieldType;

  /**
   * id is the expression identifier associated with the field selection.
   */
  id: number;

  /**
   * name is the protobuf field name.
   */
  name: string;

  /**
   * optional reports whether qualification should produce an optional value.
   */
  optional: boolean;
}

/**
 * FieldQualifier indicates that qualification targets a well-defined field with a known type.
 *
 * When the field type is known, its precomputed accessors improve the speed and efficiency of
 * field resolution.
 */
class FieldQualifier extends QualifierBase implements ConstantQualifier {
  /**
   * celValueValue stores the field name as a reusable CEL string.
   */
  private readonly celValueValue: CelString;

  /**
   * constructor stores the precomputed provider field accessors.
   */
  constructor(private readonly optionsValue: FieldQualifierOptions) {
    super(optionsValue.id, optionsValue.optional);
    this.celValueValue = new CelString(optionsValue.name);
  }

  /**
   * qualify reads the field directly through its precomputed getter.
   */
  public qualify(_vars: Activation, obj: unknown): unknown {
    const target = isValLike(obj) ? obj.value() : obj;
    return this.fieldValue(target);
  }

  /**
   * qualifyIfPresent checks field presence before reading the field value.
   */
  public override qualifyIfPresent(
    _vars: Activation,
    obj: unknown,
    presenceOnly: boolean,
  ): unknown {
    const target = isValLike(obj) ? obj.value() : obj;
    if (!this.optionsValue.fieldType.isSet(target)) {
      return qualifierAbsent;
    }
    if (presenceOnly) {
      return undefined;
    }
    return this.fieldValue(target);
  }

  /**
   * value returns the field name as a CEL string.
   */
  public value(): Val {
    return this.celValueValue;
  }

  /**
   * fieldValue reads and adapts a statically typed scalar or message field.
   */
  private fieldValue(target: unknown): Val {
    const value = this.optionsValue.fieldType.getFrom(target);
    if (value === null || value === undefined) {
      return this.optionsValue.adapter.nativeToValue(value);
    }
    switch (this.optionsValue.fieldType.type.kind()) {
      case Kind.Double:
        return new Double(Number(value));
      case Kind.Uint:
        return new Uint(BigInt(value as number | bigint));
      default:
        return this.optionsValue.adapter.nativeToValue(value);
    }
  }
}

/**
 * supportsFieldQualifier reports whether static type metadata is sufficient for exact CEL adaptation.
 */
function supportsFieldQualifier(type: Type): boolean {
  switch (type.kind()) {
    case Kind.Bool:
    case Kind.Bytes:
    case Kind.Double:
    case Kind.Duration:
    case Kind.Int:
    case Kind.String:
    case Kind.Struct:
    case Kind.Timestamp:
    case Kind.Uint:
      return true;
    default:
      // Dynamic, Any, list, and map fields require descriptor-aware conversion by ObjectValue.
      return false;
  }
}

/**
 * ConstantQualifierBase provides shared CEL value handling for constant qualifiers.
 */
abstract class ConstantQualifierBase extends QualifierBase implements ConstantQualifier {
  /**
   * celValueValue stores the qualifier's adapted CEL key for reuse across evaluations.
   */
  private readonly celValueValue: Val;

  /**
   * propertyKeyValue stores the qualifier's object-property form.
   *
   * The qualifier is constant, so its property key is too. Deriving it once here keeps it off the
   * per-access path, where every field selection in every evaluation would otherwise repeat it.
   */
  protected readonly propertyKeyValue: string;

  /**
   * constructor initializes the constant qualifier state.
   */
  constructor(
    id: number,
    optional: boolean,
    private readonly adapterValue: Adapter,
    private readonly rawValue: boolean | number | bigint | string,
    celValueOverride?: Val,
    private readonly errorOnBadPresenceTest = false,
  ) {
    super(id, optional);
    this.celValueValue = celValueOverride ?? adapterValue.nativeToValue(rawValue);
    this.propertyKeyValue = String(rawValue);
  }

  /**
   * value returns the constant CEL value associated with the qualifier.
   */
  public value(): Val {
    return this.celValueValue;
  }

  /**
   * qualifyIfPresent evaluates constant qualification with CEL presence-test semantics.
   */
  public override qualifyIfPresent(
    _vars: Activation,
    obj: unknown,
    presenceOnly: boolean,
  ): unknown {
    return qualifyConstantValue(
      this.adapterValue,
      obj,
      this.rawValue,
      this.propertyKeyValue,
      this.celValueValue,
      true,
      presenceOnly,
      this.errorOnBadPresenceTest,
    );
  }

  /**
   * raw returns the underlying native constant used to qualify the object.
   */
  protected raw(): boolean | number | bigint | string {
    return this.rawValue;
  }

  /**
   * qualifyValue evaluates constant qualification and returns the resolved value.
   */
  protected qualifyValue(obj: unknown): unknown {
    return qualifyConstantValue(
      this.adapterValue,
      obj,
      this.rawValue,
      this.propertyKeyValue,
      this.celValueValue,
      false,
      false,
      this.errorOnBadPresenceTest,
    );
  }
}

/**
 * StringQualifier applies a string-based field or map-key access.
 */
export class StringQualifier extends ConstantQualifierBase {
  /**
   * qualify applies a string field or map-key access to the target object.
   */
  public qualify(_: Activation, obj: unknown): unknown {
    return this.qualifyValue(obj);
  }
}

/**
 * BoolQualifier applies a boolean-based map-key access.
 */
export class BoolQualifier extends ConstantQualifierBase {
  /**
   * qualify applies a boolean key access to the target object.
   */
  public qualify(_: Activation, obj: unknown): unknown {
    return this.qualifyValue(obj);
  }
}

/**
 * IntQualifier applies an integer index or map-key access.
 */
export class IntQualifier extends ConstantQualifierBase {
  /**
   * qualify applies an integer index or key access to the target object.
   */
  public qualify(_: Activation, obj: unknown): unknown {
    if (Array.isArray(obj)) {
      const index = Number(this.raw());
      if (index >= 0 && index < obj.length) {
        return obj[index];
      }
      throw missingIndex(this.value());
    }
    return this.qualifyValue(obj);
  }

  /**
   * qualifyIfPresent indexes native lists directly while preserving presence-test behavior.
   */
  public override qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): unknown {
    if (Array.isArray(obj)) {
      const index = Number(this.raw());
      if (index >= 0 && index < obj.length) {
        return presenceOnly ? undefined : obj[index];
      }
      return qualifierAbsent;
    }
    return super.qualifyIfPresent(vars, obj, presenceOnly);
  }
}

/**
 * UintQualifier applies an unsigned integer index or map-key access.
 */
export class UintQualifier extends ConstantQualifierBase {
  /**
   * qualify applies an unsigned integer index or key access to the target object.
   */
  public qualify(_: Activation, obj: unknown): unknown {
    return this.qualifyValue(obj);
  }
}

/**
 * DoubleQualifier applies a floating-point index or map-key access.
 */
export class DoubleQualifier extends ConstantQualifierBase {
  /**
   * qualify applies a floating-point index or key access to the target object.
   */
  public qualify(_: Activation, obj: unknown): unknown {
    return this.qualifyValue(obj);
  }
}

/**
 * UnknownQualifier propagates an already-unknown qualifier result.
 */
class UnknownQualifier extends QualifierBase implements ConstantQualifier {
  /**
   * constructor initializes the unknown qualifier wrapper.
   */
  constructor(
    id: number,
    private readonly unknownValue: Unknown,
    optional: boolean,
  ) {
    super(id, optional);
  }

  /**
   * value returns the wrapped unknown value.
   */
  public value(): Val {
    return this.unknownValue;
  }

  /**
   * qualify propagates the unknown qualifier result without touching the target object.
   */
  public qualify(_: Activation, __: unknown): unknown {
    return this.unknownValue;
  }
}

/**
 * AttributeQualifierImpl resolves another attribute to determine the current qualifier value.
 */
class AttributeQualifierImpl extends QualifierBase {
  /**
   * constructor initializes the dynamic attribute qualifier.
   */
  constructor(
    id: number,
    private readonly attributeValue: Attribute,
    optional: boolean,
    private readonly factoryValue: AttributeFactory,
  ) {
    super(id, optional);
  }

  /**
   * addQualifier appends nested qualification to the underlying dynamic attribute.
   */
  public addQualifier(qualifier: Qualifier): Attribute {
    this.attributeValue.addQualifier(qualifier);
    return this as unknown as Attribute;
  }

  /**
   * resolve exposes the underlying dynamic attribute value for partial matching.
   */
  public resolve(vars: Activation): unknown {
    return this.attributeValue.resolve(vars);
  }

  /**
   * qualify resolves the nested attribute and then applies its value as a qualifier.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    return qualifyAttributeResult(this.factoryValue, vars, obj, this.attributeValue);
  }

  /**
   * qualifyIfPresent resolves the nested attribute and preserves cel-go's error propagation.
   */
  public override qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): unknown {
    const value = this.attributeValue.resolve(vars);
    if (value instanceof Unknown) {
      return value;
    }
    return this.factoryValue
      .qualifier({
        id: this.id(),
        value,
        optional: this.isOptional(),
      })
      .qualifyIfPresent(vars, obj, presenceOnly);
  }
}

/**
 * AbsoluteAttributeImpl resolves a top-level variable name and applies any attached qualifiers.
 */
class AbsoluteAttributeImpl implements NamespacedAttribute {
  /**
   * qualifiersValue stores the qualifier path attached to the attribute.
   */
  private readonly qualifiersValue: Qualifier[] = [];

  /**
   * constructor initializes the namespaced attribute state.
   */
  constructor(
    private readonly idValue: number,
    private readonly namespaceNamesValue: string[],
    private readonly disambiguateNamesValue: boolean,
    private readonly providerValue: Provider,
    private readonly factoryValue: AttributeFactory,
  ) {}

  /**
   * id returns the attribute id or the id of its last qualifier.
   */
  public id(): number {
    return this.qualifiersValue.length === 0
      ? this.idValue
      : this.qualifiersValue[this.qualifiersValue.length - 1]!.id();
  }

  /**
   * isOptional returns false because the top-level attribute itself is not optional.
   */
  public isOptional(): boolean {
    return false;
  }

  /**
   * addQualifier appends a qualifier to the attribute path.
   */
  public addQualifier(qualifierValue: Qualifier): Attribute {
    this.qualifiersValue.push(qualifierValue);
    return this;
  }

  /**
   * candidateVariableNames returns the variable-name candidates in CEL resolution order.
   */
  public candidateVariableNames(): string[] {
    return this.namespaceNamesValue;
  }

  /**
   * qualifiers returns the qualifiers associated with the attribute.
   */
  public qualifiers(): Qualifier[] {
    return this.qualifiersValue;
  }

  /**
   * qualify resolves the current attribute and applies it as a qualifier to the target object.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    return qualifyAttributeResult(this.factoryValue, vars, obj, this);
  }

  /**
   * qualifyIfPresent resolves the current attribute and applies it as a presence-tested qualifier.
   */
  public qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): unknown {
    return qualifyAttributeResultIfPresent(this.factoryValue, vars, obj, this, presenceOnly);
  }

  /**
   * resolve finds the first matching variable or provider identifier and then applies qualifiers.
   */
  public resolve(vars: Activation): unknown {
    const lookupVars = this.disambiguateNamesValue ? unwrapActivation(vars) : vars;
    for (const name of this.namespaceNamesValue) {
      const value = lookupVars.resolveName(name);
      if (value !== activationNameAbsent) {
        if (value instanceof Err) {
          throw value;
        }
        if (this.qualifiersValue.length === 0 && !(value instanceof Optional)) {
          // Bare identifiers need no qualifier traversal or intermediate result wrapper.
          return value;
        }
        return wrapQualifiedValue(applyQualifiers(vars, value, this.qualifiersValue));
      }
      const ident = this.providerValue.findIdent(name);
      if (ident && this.qualifiersValue.length === 0) {
        return ident;
      }
    }
    throw missingAttribute(this.namespaceNamesValue.join(", "));
  }
}

/**
 * MaybeAttributeImpl tries multiple namespaced interpretations of an unchecked attribute path.
 */
class MaybeAttributeImpl implements Attribute {
  /**
   * constructor initializes the maybe-attribute state.
   */
  constructor(
    private readonly idValue: number,
    private attrsValue: NamespacedAttribute[],
    private readonly factoryValue: AttributeFactory,
  ) {}

  /**
   * id returns the id of the leading candidate attribute.
   */
  public id(): number {
    return this.attrsValue[0]!.id();
  }

  /**
   * isOptional returns false because the top-level attribute itself is not optional.
   */
  public isOptional(): boolean {
    return false;
  }

  /**
   * addQualifier appends the qualifier to every candidate attribute and creates more specific name candidates.
   */
  public addQualifier(qualifierValue: Qualifier): Attribute {
    const augmentedNames: string[] = [];
    const isConst = isConstantQualifier(qualifierValue);
    const rawString =
      isConst && typeof qualifierValue.value().value() === "string"
        ? (qualifierValue.value().value() as string)
        : undefined;
    for (const attr of this.attrsValue) {
      if (rawString !== undefined && attr.qualifiers().length === 0) {
        for (const name of attr.candidateVariableNames()) {
          augmentedNames.push(`${name}.${rawString}`);
        }
      }
      attr.addQualifier(qualifierValue);
    }
    if (augmentedNames.length > 0) {
      this.attrsValue = [
        this.factoryValue.absoluteAttribute(qualifierValue.id(), ...augmentedNames),
        ...this.attrsValue,
      ];
    }
    return this;
  }

  /**
   * qualify resolves the current attribute and applies it as a qualifier to the target object.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    return qualifyAttributeResult(this.factoryValue, vars, obj, this);
  }

  /**
   * qualifyIfPresent resolves the current attribute and applies it as a presence-tested qualifier.
   */
  public qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): unknown {
    return qualifyAttributeResultIfPresent(this.factoryValue, vars, obj, this, presenceOnly);
  }

  /**
   * resolve follows the variable resolution rules to determine whether the attribute is a variable or a field selection.
   */
  public resolve(vars: Activation): unknown {
    let deferredError: ResolutionError | undefined;
    for (const attr of this.attrsValue) {
      try {
        return attr.resolve(vars);
      } catch (error) {
        if (!(error instanceof ResolutionError) || !error.isMissingAttribute()) {
          throw error;
        }
        deferredError ??= error;
      }
    }
    throw deferredError ?? missingAttribute(String(this.idValue));
  }
}

/**
 * ConditionalAttributeImpl resolves one of two attribute branches based on a condition expression.
 */
export class ConditionalAttributeImpl implements Attribute {
  /**
   * constructor initializes the conditional attribute state.
   */
  constructor(
    private readonly idValue: number,
    private readonly exprValue: {
      exec(frame: ExecutionFrame): Val;
      eval(vars: Activation): Val;
    },
    private readonly truthyValue: Attribute,
    private readonly falsyValue: Attribute,
    private readonly factoryValue: AttributeFactory,
  ) {}

  /**
   * id returns a stable expression id for the conditional attribute.
   */
  public id(): number {
    const truthyId = this.truthyValue.id();
    const falsyId = this.falsyValue.id();
    return truthyId === falsyId ? truthyId : this.idValue;
  }

  /**
   * isOptional returns false because optionality is carried by nested qualifiers.
   */
  public isOptional(): boolean {
    return false;
  }

  /**
   * addQualifier appends the same qualifier to both conditional branches.
   */
  public addQualifier(qualifierValue: Qualifier): Attribute {
    this.truthyValue.addQualifier(qualifierValue);
    this.falsyValue.addQualifier(qualifierValue);
    return this;
  }

  /**
   * qualify resolves the attribute and applies it to the target object.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    return qualifyAttributeResult(this.factoryValue, vars, obj, this);
  }

  /**
   * qualifyIfPresent resolves the attribute and applies a presence-tested qualification.
   */
  public qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): unknown {
    return qualifyAttributeResultIfPresent(this.factoryValue, vars, obj, this, presenceOnly);
  }

  /**
   * resolve evaluates the condition and then resolves the selected branch.
   */
  public resolve(vars: Activation): unknown {
    const condition = this.exprValue.eval(vars);
    if (condition instanceof Bool) {
      return condition.value() ? this.truthyValue.resolve(vars) : this.falsyValue.resolve(vars);
    }
    if (condition instanceof Unknown) {
      return condition;
    }
    if (condition instanceof Err) {
      throw condition;
    }
    throw new Err("no such overload");
  }

  /**
   * resolveExhaustively evaluates both branches before returning the condition-selected result.
   */
  public resolveExhaustively(vars: Activation): unknown {
    const condition = this.exprValue.eval(vars);
    let truthy: unknown;
    let truthyError: unknown;
    let falsy: unknown;
    let falsyError: unknown;
    try {
      truthy = this.truthyValue.resolve(vars);
    } catch (error) {
      truthyError = error;
    }
    try {
      falsy = this.falsyValue.resolve(vars);
    } catch (error) {
      falsyError = error;
    }
    if (condition instanceof Bool) {
      const selectedError = condition.value() ? truthyError : falsyError;
      if (selectedError !== undefined) {
        throw selectedError;
      }
      return condition.value() ? truthy : falsy;
    }
    if (condition instanceof Unknown) {
      return condition;
    }
    if (condition instanceof Err) {
      throw condition;
    }
    throw new Err("no such overload");
  }
}

/**
 * RelativeAttributeImpl resolves a dynamic operand and then applies qualifiers to its result.
 */
class RelativeAttributeImpl implements Attribute {
  /**
   * qualifiersValue stores the qualifier path attached to the relative attribute.
   */
  private readonly qualifiersValue: Qualifier[] = [];
  private optionalValue = false;

  /**
   * constructor initializes the relative attribute state.
   */
  constructor(
    private readonly idValue: number,
    private readonly operandValue: {
      exec(frame: ExecutionFrame): Val;
      eval(vars: Activation): Val;
    },
    private readonly factoryValue: AttributeFactory,
  ) {}

  /**
   * id returns the attribute id or the id of its last qualifier.
   */
  public id(): number {
    return this.qualifiersValue.length === 0
      ? this.idValue
      : this.qualifiersValue[this.qualifiersValue.length - 1]!.id();
  }

  /**
   * isOptional returns false because optionality is carried by nested qualifiers.
   */
  public isOptional(): boolean {
    return this.optionalValue;
  }

  /**
   * withOptional marks this dynamic attribute as an optional qualifier.
   */
  public withOptional(): Attribute {
    this.optionalValue = true;
    return this;
  }

  /**
   * addQualifier appends a qualifier to the relative attribute path.
   */
  public addQualifier(qualifierValue: Qualifier): Attribute {
    this.qualifiersValue.push(qualifierValue);
    return this;
  }

  /**
   * qualify resolves the attribute and applies it to the target object.
   */
  public qualify(vars: Activation, obj: unknown): unknown {
    return qualifyAttributeResult(this.factoryValue, vars, obj, this);
  }

  /**
   * qualifyIfPresent resolves the attribute and applies a presence-tested qualification.
   */
  public qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): unknown {
    return qualifyAttributeResultIfPresent(this.factoryValue, vars, obj, this, presenceOnly);
  }

  /**
   * resolve evaluates the operand and then applies the relative qualifiers.
   */
  public resolve(vars: Activation): unknown {
    const operand = this.operandValue.eval(vars);
    if (operand instanceof Err) {
      throw operand;
    }
    if (operand instanceof Unknown) {
      return operand;
    }
    return wrapQualifiedValue(applyQualifiers(vars, operand, this.qualifiersValue));
  }
}

/**
 * attributeFactory creates the default attribute and qualifier runtime.
 */
export function attributeFactory(options: AttributeFactoryOptions = {}): AttributeFactory {
  return new AttributeFactoryImpl(
    options.containerValue ?? defaultContainer,
    options.adapter ?? DefaultTypeAdapter,
    options.provider ??
      ({
        enumValue: () => {
          throw new Error("provider not configured");
        },
        findIdent: () => undefined,
        findStructType: () => undefined,
        findStructFieldNames: () => undefined,
        findStructFieldType: () => undefined,
        newValue: () => {
          throw new Error("provider not configured");
        },
      } satisfies Provider),
    options.errorOnBadPresenceTest ?? false,
  );
}

/**
 * applyQualifiers applies a list of qualifiers to a resolved base object.
 */
export function applyQualifiers(
  vars: Activation,
  obj: unknown,
  qualifiersValue: Qualifier[],
): AppliedQualifiersResult {
  let current = obj;
  let optional = false;
  if (current instanceof Optional) {
    if (!current.hasValue()) {
      return { value: OptionalNone, optional: false };
    }
    current = current.getValue();
    optional = true;
  }
  for (const qualifierValue of qualifiersValue) {
    // Optional values may appear at any point in a qualified path, including as map values.
    // Treat absence as a safe traversal result before applying the next qualifier.
    if (current instanceof Optional) {
      if (!current.hasValue()) {
        return { value: OptionalNone, optional: false };
      }
      current = current.getValue();
      optional = true;
    }
    optional = optional || qualifierValue.isOptional();
    if (optional) {
      const qualified = qualifierValue.qualifyIfPresent(vars, current, false);
      if (qualified === qualifierAbsent) {
        return { value: OptionalNone, optional: false };
      }
      current = qualified;
      continue;
    }
    current = qualifierValue.qualify(vars, current);
  }
  return { value: current, optional };
}

/**
 * qualifyAttributeResult applies the value of a resolved attribute as a qualifier to the target object.
 */
export function qualifyAttributeResult(
  fac: AttributeFactory,
  vars: Activation,
  obj: unknown,
  qualifierAttribute: Attribute,
): unknown {
  const value = qualifierAttribute.resolve(vars);
  if (value instanceof Unknown) {
    return value;
  }
  return fac
    .qualifier({
      id: qualifierAttribute.id(),
      value,
      optional: qualifierAttribute.isOptional(),
    })
    .qualify(vars, obj);
}

/**
 * qualifyAttributeResultIfPresent applies the value of a resolved attribute as a presence-tested qualifier.
 */
export function qualifyAttributeResultIfPresent(
  fac: AttributeFactory,
  vars: Activation,
  obj: unknown,
  qualifierAttribute: Attribute,
  presenceOnly: boolean,
): unknown {
  const value = qualifierAttribute.resolve(vars);
  if (value instanceof Unknown) {
    return value;
  }
  return fac
    .qualifier({
      id: qualifierAttribute.id(),
      value,
      optional: qualifierAttribute.isOptional(),
    })
    .qualifyIfPresent(vars, obj, presenceOnly);
}

/**
 * isAttribute returns whether the input satisfies the Attribute interface.
 */
export function isAttribute(value: unknown): value is Attribute {
  return (
    typeof value === "object" &&
    value !== null &&
    "resolve" in value &&
    typeof (value as { resolve?: unknown }).resolve === "function" &&
    "addQualifier" in value &&
    typeof (value as { addQualifier?: unknown }).addQualifier === "function"
  );
}

/**
 * optionalAttribute marks an attribute used as a dynamic qualifier as optional.
 */
export function optionalAttribute(attribute: Attribute): Attribute {
  return new OptionalAttribute(attribute);
}

/**
 * OptionalAttribute delegates dynamic resolution while reporting optional qualifier semantics.
 */
class OptionalAttribute implements Attribute {
  /** constructor stores the dynamic qualifier attribute. */
  constructor(private readonly attribute: Attribute) {}

  /** id returns the delegated expression identifier. */
  public id(): number {
    return this.attribute.id();
  }

  /** isOptional reports that missing qualification yields optional.none. */
  public isOptional(): boolean {
    return true;
  }

  /** addQualifier appends a nested qualifier to the delegated attribute. */
  public addQualifier(qualifier: Qualifier): Attribute {
    this.attribute.addQualifier(qualifier);
    return this;
  }

  /** qualify delegates dynamic qualification. */
  public qualify(vars: Activation, obj: unknown): unknown {
    return this.attribute.qualify(vars, obj);
  }

  /** qualifyIfPresent delegates presence-aware dynamic qualification. */
  public qualifyIfPresent(vars: Activation, obj: unknown, presenceOnly: boolean): unknown {
    return this.attribute.qualifyIfPresent(vars, obj, presenceOnly);
  }

  /** resolve delegates dynamic attribute resolution. */
  public resolve(vars: Activation): unknown {
    return this.attribute.resolve(vars);
  }
}

/**
 * isConstantQualifier returns whether the qualifier exposes a constant CEL value.
 */
export function isConstantQualifier(value: Qualifier): value is ConstantQualifier {
  return "value" in value && typeof value.value === "function";
}

/**
 * missingAttribute creates a resolution error for a missing variable or field path.
 */
export function missingAttribute(attr: string): ResolutionError {
  return new ResolutionError(attr, `no such attribute(s): ${attr}`);
}

/**
 * missingIndex creates a resolution error for an out-of-bounds index access.
 */
export function missingIndex(indexValue: Val): ResolutionError {
  return new ResolutionError(undefined, `index out of bounds: ${formatQualifierValue(indexValue)}`);
}

/**
 * missingKey creates a resolution error for a missing map key.
 */
export function missingKey(keyValue: Val): ResolutionError {
  return new ResolutionError(undefined, `no such key: ${formatQualifierValue(keyValue)}`);
}

/**
 * qualifyConstantValue applies a constant qualifier while preserving cel-go's native fast paths
 * and presence-test behavior.
 *
 * Every qualifier in an expression runs this per evaluation, so the qualifier state arrives as
 * arguments rather than in an options object: a nested selection such as `a.b.c.d` would otherwise
 * allocate one short-lived object per path segment per evaluation.
 */
function qualifyConstantValue(
  adapter: Adapter,
  obj: unknown,
  rawQualifier: boolean | number | bigint | string,
  propertyKey: string,
  key: Val,
  presenceTest: boolean,
  presenceOnly: boolean,
  errorOnBadPresenceTest: boolean,
): unknown {
  if (obj instanceof Unknown) {
    return obj;
  }
  if (obj instanceof Err) {
    throw obj;
  }
  if (Array.isArray(obj)) {
    const index = nativeIndexFromQualifier(key);
    if (index instanceof Error) {
      throw index;
    }
    if (index >= 0 && index < obj.length) {
      return presenceOnly ? undefined : obj[index];
    }
    if (presenceTest) {
      return qualifierAbsent;
    }
    throw missingIndex(key);
  }
  if (obj instanceof Map) {
    if (obj.has(rawQualifier)) {
      return presenceOnly ? undefined : obj.get(rawQualifier);
    }
    if (presenceTest) {
      return qualifierAbsent;
    }
    throw missingKey(key);
  }
  if (isProtoMapValue(obj)) {
    if (Object.hasOwn(obj.map, propertyKey)) {
      return presenceOnly ? undefined : obj.map[propertyKey];
    }
    if (presenceTest) {
      return qualifierAbsent;
    }
    throw missingKey(key);
  }
  // The branches above already ruled out lists, maps, and protobuf map wrappers, so the remaining
  // record test only has to exclude CEL values and protobuf messages.
  if (typeof obj === "object" && obj !== null && !isValLike(obj) && !isProtoMessage(obj)) {
    // A present field is the common case, so read it first and only pay a separate presence check
    // when the read is undefined, which cannot distinguish an absent key from a defined one.
    const fieldValue = (obj as Record<string, unknown>)[propertyKey];
    if (fieldValue !== undefined || Object.hasOwn(obj, propertyKey)) {
      return presenceOnly ? undefined : fieldValue;
    }
    if (presenceTest) {
      return qualifierAbsent;
    }
    throw missingKey(key);
  }
  const celValue = isValLike(obj) ? obj : adapter.nativeToValue(obj);
  if (celValue instanceof Unknown) {
    return celValue;
  }
  if (celValue instanceof Err) {
    throw celValue;
  }
  if (isMapperValue(celValue)) {
    const value = celValue.find(key);
    if (value instanceof Err) {
      throw value;
    }
    if (value !== undefined) {
      return presenceOnly ? undefined : value;
    }
    if (presenceTest) {
      return qualifierAbsent;
    }
    throw missingKey(key);
  }
  if (isListerValue(celValue)) {
    const index = nativeIndexFromQualifier(key);
    if (index instanceof Error) {
      throw index;
    }
    const size = celValue.size();
    if (size instanceof Err) {
      throw size;
    }
    if (index >= 0 && index < Number(size.value())) {
      return presenceOnly ? undefined : celValue.get(key);
    }
    if (presenceTest) {
      return qualifierAbsent;
    }
    throw missingIndex(key);
  }
  if (isIndexerValue(celValue)) {
    if (presenceTest && isFieldTesterValue(celValue)) {
      const fieldSet = celValue.isSet(key);
      if (fieldSet instanceof Err) {
        throw fieldSet;
      }
      if (!(fieldSet instanceof Bool)) {
        throw new Error(`unexpected field-set result: ${String(fieldSet)}`);
      }
      // Presence-only checks and absent fields return before forcing a value read.
      if (presenceOnly || !fieldSet.value()) {
        return fieldSet.value() ? undefined : qualifierAbsent;
      }
    }
    const value = celValue.get(key);
    if (value instanceof Err) {
      throw value;
    }
    return presenceOnly ? undefined : value;
  }
  if (presenceTest && !errorOnBadPresenceTest) {
    return qualifierAbsent;
  }
  throw missingKey(key);
}

/**
 * nativeIndexFromQualifier converts a CEL numeric qualifier into a list index or an error.
 */
function nativeIndexFromQualifier(index: Val): number | Error {
  if (index instanceof Int) {
    return Number(index.value());
  }
  if (index instanceof Double) {
    const value = index.value();
    if (Number.isInteger(value) && Number.isSafeInteger(value)) {
      return value;
    }
    return new Error(`unsupported index value ${value} in list`);
  }
  if (index instanceof Uint) {
    const value = index.value();
    if (value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }
    return new Error(`unsupported index value ${value} in list`);
  }
  return new Error(`unsupported index type '${index.type()}' in list`);
}

/**
 * invalidQualifierType returns the cel-go-like qualifier type error.
 */
function invalidQualifierType(value: unknown): Error {
  return new Error(`invalid qualifier type: ${describeQualifierType(value)}`);
}

/**
 * formatQualifierValue renders CEL qualifier values using their underlying native representation.
 */
function formatQualifierValue(value: Val): string {
  const native = value.value();
  if (typeof native === "string" || typeof native === "number" || typeof native === "boolean") {
    return String(native);
  }
  if (typeof native === "bigint") {
    return native.toString();
  }
  if (native instanceof Uint8Array) {
    return String(value);
  }
  return String(value);
}

/**
 * describeQualifierType renders a stable type description for qualifier-construction errors.
 */
function describeQualifierType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (isValLike(value)) {
    return value.type().typeName();
  }
  if (typeof value === "object" || typeof value === "function") {
    const constructorName = (value as { constructor?: { name?: string } }).constructor?.name;
    if (constructorName) {
      return constructorName;
    }
  }
  return typeof value;
}

/**
 * isQualifier returns whether the value already satisfies the qualifier interface.
 */
function isQualifier(value: unknown): value is Qualifier {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "function" &&
    "qualify" in value &&
    typeof (value as { qualify?: unknown }).qualify === "function"
  );
}

/**
 * isProtoMessage returns whether the input looks like a protobuf message object.
 */
function isProtoMessage(value: unknown): value is { $typeName: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "$typeName" in value &&
    typeof (value as { $typeName?: unknown }).$typeName === "string"
  );
}

/**
 * isProtoMapValue returns whether the input is the protobuf map wrapper used by descriptor-backed fields.
 */
function isProtoMapValue(value: unknown): value is MapValue {
  return (
    typeof value === "object" &&
    value !== null &&
    "map" in value &&
    "keyType" in value &&
    "valueType" in value
  );
}

/**
 * unwrapActivation removes any activation wrappers so disambiguated resolution sees caller input variables.
 */
function unwrapActivation(vars: Activation): Activation {
  let current = vars;
  while (
    typeof current === "object" &&
    current !== null &&
    "unwrap" in current &&
    typeof (current as { unwrap?: unknown }).unwrap === "function"
  ) {
    current = (current as { unwrap: () => Activation }).unwrap();
  }
  return current;
}

/**
 * isListerValue returns whether the input supports CEL list-style indexing.
 */
function isListerValue(value: unknown): value is Lister {
  return (
    typeof value === "object" &&
    value !== null &&
    "get" in value &&
    typeof (value as { get?: unknown }).get === "function" &&
    "size" in value &&
    typeof (value as { size?: unknown }).size === "function" &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "function" &&
    (value as unknown as Val).type() === ListType
  );
}

/**
 * isMapperValue returns whether the input supports CEL map-style lookup.
 */
function isMapperValue(value: unknown): value is Mapper {
  return (
    typeof value === "object" &&
    value !== null &&
    "find" in value &&
    typeof (value as { find?: unknown }).find === "function" &&
    "contains" in value &&
    typeof (value as { contains?: unknown }).contains === "function"
  );
}

/**
 * isIndexerValue returns whether the input supports CEL object or index lookups.
 */
function isIndexerValue(value: unknown): value is Indexer {
  return (
    typeof value === "object" && value !== null && typeof (value as Indexer).get === "function"
  );
}

/**
 * isFieldTesterValue returns whether the input supports CEL field presence tests.
 */
function isFieldTesterValue(value: unknown): value is FieldTester {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FieldTester).isSet === "function"
  );
}

/**
 * isValLike returns whether the input already satisfies the CEL ref.Val contract.
 */
function isValLike(value: unknown): value is Val {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "function" &&
    "value" in value &&
    typeof (value as { value?: unknown }).value === "function"
  );
}

/**
 * wrapQualifiedValue converts an applyQualifiers result into the attribute result shape.
 */
function wrapQualifiedValue(result: AppliedQualifiersResult): unknown {
  if (result.value instanceof Unknown || result.value === OptionalNone) {
    return result.value;
  }
  if (!result.optional) {
    return result.value;
  }
  return optionalOf(DefaultTypeAdapter.nativeToValue(result.value));
}
