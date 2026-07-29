import type { SourceInfo } from "../common/ast/ast.js";
import type { PolicySource } from "./source.js";

/**
 * ValueString contains an identifier corresponding to source metadata and a simple string.
 */
export interface ValueString {
  /** id identifies the value in the policy source information. */
  id: number;
  /** value contains the parsed string. */
  value: string;
}

/**
 * policy creates a policy object which references a policy source and source information.
 */
export function policy(source: PolicySource, info: SourceInfo): Policy {
  return new Policy(source, info);
}

/**
 * Policy declares a name, rule, and first-match evaluation semantic for an expression graph.
 */
export class Policy {
  /** nameValue stores the policy name. */
  private nameValue: ValueString = { id: 0, value: "" };
  /** descriptionValue stores the human-readable policy description. */
  private descriptionValue: ValueString = { id: 0, value: "" };
  /** importsValue stores the policy's imported type names. */
  private importsValue: PolicyImport[] = [];
  /** ruleValue stores the policy entry point. */
  private ruleValue?: Rule;
  /** metadataValue stores extension-owned policy metadata. */
  private readonly metadataValue = new Map<string, unknown>();

  /** constructor configures the policy's source and source information. */
  public constructor(
    private readonly sourceValue: PolicySource,
    private readonly sourceInfoValue: SourceInfo,
  ) {}

  /** source returns the policy file contents as a CEL source object. */
  public source(): PolicySource {
    return this.sourceValue;
  }

  /** sourceInfo returns metadata about expression positions in the policy file. */
  public sourceInfo(): SourceInfo {
    return this.sourceInfoValue;
  }

  /** imports returns the list of imports associated with the policy. */
  public imports(): PolicyImport[] {
    return [...this.importsValue];
  }

  /** name returns the name of the policy. */
  public name(): ValueString {
    return this.nameValue;
  }

  /** description returns the description of the policy. */
  public description(): ValueString {
    return this.descriptionValue;
  }

  /** rule returns the rule entry point of the policy. */
  public rule(): Rule | undefined {
    return this.ruleValue;
  }

  /** metadata returns a named metadata object when it exists. */
  public metadata(name: string): [unknown, boolean] {
    return [this.metadataValue.get(name), this.metadataValue.has(name)];
  }

  /** metadataKeys returns the metadata keys set on the policy. */
  public metadataKeys(): string[] {
    return [...this.metadataValue.keys()];
  }

  /** addImport adds an import to the policy. */
  public addImport(value: PolicyImport): void {
    this.importsValue.push(value);
  }

  /** setName configures the policy name. */
  public setName(value: ValueString): void {
    this.nameValue = value;
  }

  /** setDescription configures the policy description. */
  public setDescription(value: ValueString): void {
    this.descriptionValue = value;
  }

  /** setRule configures the policy rule entry point. */
  public setRule(value: Rule): void {
    this.ruleValue = value;
  }

  /** setMetadata updates a named metadata key. */
  public setMetadata(name: string, value: unknown): void {
    this.metadataValue.set(name, value);
  }

  /** clearMetadata removes a named metadata key. */
  public clearMetadata(name: string): void {
    this.metadataValue.delete(name);
  }

  /**
   * explanationOutputPolicy returns a copy whose match outputs use explanation expressions.
   */
  public explanationOutputPolicy(): Policy {
    const explanation = new Policy(this.sourceValue, this.sourceInfoValue);
    explanation.nameValue = this.nameValue;
    explanation.descriptionValue = this.descriptionValue;
    explanation.importsValue = [...this.importsValue];
    for (const [name, value] of this.metadataValue) {
      explanation.metadataValue.set(name, value);
    }
    if (this.ruleValue) {
      explanation.ruleValue = this.ruleValue.explanationOutputRule();
    }
    return explanation;
  }
}

/**
 * policyImport creates an imported type name node.
 */
export function policyImport(sourceId: number): PolicyImport {
  return new PolicyImport(sourceId);
}

/**
 * PolicyImport represents an imported type name which is aliased within CEL expressions.
 */
export class PolicyImport {
  /** nameValue stores the fully qualified type name. */
  private nameValue: ValueString = { id: 0, value: "" };

  /** constructor associates the import with a source identifier. */
  public constructor(private readonly sourceIdValue: number) {}

  /** sourceId returns the source identifier associated with the import. */
  public sourceId(): number {
    return this.sourceIdValue;
  }

  /** name returns the fully qualified type name. */
  public name(): ValueString {
    return this.nameValue;
  }

  /** setName updates the fully qualified type name. */
  public setName(value: ValueString): void {
    this.nameValue = value;
  }
}

/**
 * rule creates an empty rule instance.
 */
export function rule(sourceId: number): Rule {
  return new Rule(sourceId);
}

/**
 * Rule declares an identifier, description, variables, and match statements.
 */
export class Rule {
  /** idValue stores the optional rule identifier. */
  private idValue?: ValueString;
  /** descriptionValue stores the optional rule description. */
  private descriptionValue?: ValueString;
  /** variablesValue stores variables in declaration order. */
  private readonly variablesValue: Variable[] = [];
  /** matchesValue stores matches in evaluation order. */
  private readonly matchesValue: Match[] = [];

  /** constructor associates the rule with its source identifier. */
  public constructor(private readonly sourceIdValue: number) {}

  /** sourceId returns the source identifier associated with the rule. */
  public sourceId(): number {
    return this.sourceIdValue;
  }

  /** id returns the rule identifier when set. */
  public id(): ValueString {
    return this.idValue ?? { id: 0, value: "" };
  }

  /** description returns the rule description when set. */
  public description(): ValueString {
    return this.descriptionValue ?? { id: 0, value: "" };
  }

  /** matches returns the ordered match declarations. */
  public matches(): Match[] {
    return [...this.matchesValue];
  }

  /** variables returns the ordered variable declarations. */
  public variables(): Variable[] {
    return [...this.variablesValue];
  }

  /** setId configures the rule identifier. */
  public setId(value: ValueString): void {
    this.idValue = value;
  }

  /** setDescription configures the rule description. */
  public setDescription(value: ValueString): void {
    this.descriptionValue = value;
  }

  /** addMatch adds a match to the rule. */
  public addMatch(value: Match): void {
    this.matchesValue.push(value);
  }

  /** addVariable adds a variable to the rule. */
  public addVariable(value: Variable): void {
    this.variablesValue.push(value);
  }

  /** addVariables adds variables to the rule in order. */
  public addVariables(values: Variable[]): void {
    this.variablesValue.push(...values);
  }

  /** explanationOutputRule copies this rule using explanation expressions as outputs. */
  public explanationOutputRule(): Rule {
    const explanation = new Rule(this.sourceIdValue);
    explanation.idValue = this.idValue;
    explanation.descriptionValue = this.descriptionValue;
    explanation.addVariables(this.variables());
    for (const sourceMatch of this.matchesValue) {
      const target = match(sourceMatch.sourceId());
      target.setCondition(sourceMatch.condition());
      if (sourceMatch.hasExplanation()) {
        target.setOutput(sourceMatch.explanation());
      }
      if (sourceMatch.hasRule()) {
        target.setRule(sourceMatch.rule()!.explanationOutputRule());
      }
      explanation.addMatch(target);
    }
    return explanation;
  }
}

/**
 * variable creates a named expression node.
 */
export function variable(sourceId: number): Variable {
  return new Variable(sourceId);
}

/**
 * Variable is a named expression which may be referenced in subsequent expressions.
 */
export class Variable {
  /** nameValue stores the variable name. */
  private nameValue: ValueString = { id: 0, value: "" };
  /** expressionValue stores the CEL expression. */
  private expressionValue: ValueString = { id: 0, value: "" };

  /** constructor associates the variable with its source identifier. */
  public constructor(private readonly sourceIdValue: number) {}

  /** sourceId returns the variable source identifier. */
  public sourceId(): number {
    return this.sourceIdValue;
  }

  /** name returns the variable name. */
  public name(): ValueString {
    return this.nameValue;
  }

  /** expression returns the variable expression. */
  public expression(): ValueString {
    return this.expressionValue;
  }

  /** setName sets the variable name. */
  public setName(value: ValueString): void {
    this.nameValue = value;
  }

  /** setExpression sets the variable expression. */
  public setExpression(value: ValueString): void {
    this.expressionValue = value;
  }
}

/**
 * match creates a condition and output or nested-rule node.
 */
export function match(sourceId: number): Match {
  return new Match(sourceId);
}

/**
 * Match declares a condition and either an output or a nested rule.
 */
export class Match {
  /** conditionValue stores the CEL condition. */
  private conditionValue: ValueString = { id: 0, value: "" };
  /** outputValue stores the optional CEL output. */
  private outputValue?: ValueString;
  /** explanationValue stores the optional CEL explanation. */
  private explanationValue?: ValueString;
  /** ruleValue stores the optional nested rule. */
  private ruleValue?: Rule;

  /** constructor associates the match with its source identifier. */
  public constructor(private readonly sourceIdValue: number) {}

  /** sourceId returns the source identifier associated with the match. */
  public sourceId(): number {
    return this.sourceIdValue;
  }

  /** condition returns the condition expression. */
  public condition(): ValueString {
    return this.conditionValue;
  }

  /** hasOutput reports whether the output field is set. */
  public hasOutput(): boolean {
    return this.outputValue !== undefined;
  }

  /** output returns the output expression or an empty value. */
  public output(): ValueString {
    return this.outputValue ?? { id: 0, value: "" };
  }

  /** hasExplanation reports whether the explanation field is set. */
  public hasExplanation(): boolean {
    return this.explanationValue !== undefined;
  }

  /** explanation returns the explanation expression or an empty value. */
  public explanation(): ValueString {
    return this.explanationValue ?? { id: 0, value: "" };
  }

  /** hasRule reports whether a nested rule is set. */
  public hasRule(): boolean {
    return this.ruleValue !== undefined;
  }

  /** rule returns the nested rule when set. */
  public rule(): Rule | undefined {
    return this.ruleValue;
  }

  /** setCondition sets the CEL condition. */
  public setCondition(value: ValueString): void {
    this.conditionValue = value;
  }

  /** setOutput sets the CEL output expression. */
  public setOutput(value: ValueString): void {
    this.outputValue = value;
  }

  /** setExplanation sets the CEL explanation expression. */
  public setExplanation(value: ValueString): void {
    this.explanationValue = value;
  }

  /** setRule sets the nested rule. */
  public setRule(value: Rule): void {
    this.ruleValue = value;
  }
}
