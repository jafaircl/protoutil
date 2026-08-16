import { load } from "js-yaml";
import { type Issues, issues } from "../cel/env.js";
import { type SourceInfo, sourceInfo } from "../common/ast/ast.js";
import { errorsValue } from "../common/errors.js";
import type { Source } from "./source.js";

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
export function policy(source: Source, info: SourceInfo): Policy {
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
  private importsValue: Import[] = [];
  /** ruleValue stores the policy entry point. */
  private ruleValue?: Rule;
  /** metadataValue stores extension-owned policy metadata. */
  private readonly metadataValue = new Map<string, unknown>();

  /** constructor configures the policy's source and source information. */
  public constructor(
    private readonly sourceValue: Source,
    private readonly sourceInfoValue: SourceInfo,
  ) {}

  /** source returns the policy file contents as a CEL source object. */
  public source(): Source {
    return this.sourceValue;
  }

  /** sourceInfo returns metadata about expression positions in the policy file. */
  public sourceInfo(): SourceInfo {
    return this.sourceInfoValue;
  }

  /** imports returns the list of imports associated with the policy. */
  public imports(): Import[] {
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
  public addImport(value: Import): void {
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
 * importValue creates an imported type name node.
 */
export function importValue(sourceId: number): Import {
  return new Import(sourceId);
}

/**
 * Import represents an imported type name which is aliased within CEL expressions.
 */
export class Import {
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
 * RuleSemantic selects how a rule combines the outcomes of its choices.
 *
 * `first-match` stops at the first choice whose condition holds and yields that choice's outcome.
 * `aggregate` evaluates every choice and collects the matching outcomes into a list.
 */
export type RuleSemantic = "first-match" | "aggregate";

/**
 * Rule declares an identifier, description, variables, and match statements.
 */
export class Rule {
  /** semanticValue stores how the rule combines its choices. */
  private semanticValue: RuleSemantic = "first-match";
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

  /** semantic returns how the rule combines the outcomes of its choices. */
  public semantic(): RuleSemantic {
    return this.semanticValue;
  }

  /** setSemantic configures how the rule combines the outcomes of its choices. */
  public setSemantic(value: RuleSemantic): void {
    this.semanticValue = value;
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
    explanation.semanticValue = this.semanticValue;
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

/**
 * ParserContext exposes policy construction and diagnostic services to custom tag visitors.
 */
export interface ParserContext {
  /** nextId returns a monotonically increasing source identifier. */
  nextId(): number;
  /** stringValue creates a source-associated string value. */
  stringValue(value: unknown, fieldName?: string): ValueString;
  /** parseRule parses a custom policy field as a canonical rule. */
  parseRule(options: ParseRuleOptions): Rule;
  /** parseMatch parses a custom rule field as a canonical match. */
  parseMatch(options: ParseMatchOptions): Match;
  /** reportErrorAtId records a parser diagnostic. */
  reportErrorAtId(id: number, message: string, ...args: unknown[]): void;
}

/** ParseRuleOptions describes a custom visitor request to parse a canonical rule. */
export interface ParseRuleOptions {
  /** policy is the policy which owns the rule. */
  policy: Policy;
  /** value is the decoded YAML rule value. */
  value: unknown;
  /** id identifies the rule field in source metadata. */
  id: number;
}

/** ParseMatchOptions describes a custom visitor request to parse a canonical match. */
export interface ParseMatchOptions {
  /** policy is the policy which owns the match. */
  policy: Policy;
  /** value is the decoded YAML match value. */
  value: unknown;
  /** id identifies the match in source metadata. */
  id: number;
}

/**
 * PolicyTagOptions describes an unrecognized top-level policy field.
 */
export interface PolicyTagOptions {
  /** context provides parser services. */
  context: ParserContext;
  /** id identifies the field in source metadata. */
  id: number;
  /** tagName is the unrecognized mapping key. */
  tagName: string;
  /** value is the decoded YAML value. */
  value: unknown;
  /** policy is the policy currently being populated. */
  policy: Policy;
}

/**
 * RuleTagOptions describes an unrecognized rule field.
 */
export interface RuleTagOptions extends PolicyTagOptions {
  /** rule is the rule currently being populated. */
  rule: Rule;
}

/**
 * MatchTagOptions describes an unrecognized match field.
 */
export interface MatchTagOptions extends PolicyTagOptions {
  /** match is the match currently being populated. */
  match: Match;
}

/**
 * VariableTagOptions describes an unrecognized variable field.
 */
export interface VariableTagOptions extends PolicyTagOptions {
  /** variable is the variable currently being populated. */
  variable: Variable;
}

/**
 * TagVisitor handles custom fields on policy model objects.
 */
export interface TagVisitor {
  /** policyTag handles an unrecognized policy field. */
  policyTag(options: PolicyTagOptions): void;
  /** ruleTag handles an unrecognized rule field. */
  ruleTag(options: RuleTagOptions): void;
  /** matchTag handles an unrecognized match field. */
  matchTag(options: MatchTagOptions): void;
  /** variableTag handles an unrecognized variable field. */
  variableTag(options: VariableTagOptions): void;
}

/**
 * defaultTagVisitor returns a visitor which reports every non-canonical field.
 */
export function defaultTagVisitor(): TagVisitor {
  return {
    policyTag: ({ context, id, tagName }) => {
      // Description is canonical but remains observable for compatibility with early clients.
      if (tagName !== "description") {
        context.reportErrorAtId(id, "unsupported policy tag: %s", tagName);
      }
    },
    ruleTag: ({ context, id, tagName }) =>
      context.reportErrorAtId(id, "unsupported rule tag: %s", tagName),
    matchTag: ({ context, id, tagName }) =>
      context.reportErrorAtId(id, "unsupported match tag: %s", tagName),
    variableTag: ({ context, id, tagName }) =>
      context.reportErrorAtId(id, "unsupported variable tag: %s", tagName),
  };
}

/**
 * ParserOptions configures policy parsing without functional options.
 */
export interface ParserOptions {
  /** simpleVariables permits one-entry variable maps such as `- name: expression`. */
  simpleVariables?: boolean;
  /** tagVisitor handles fields outside the canonical policy schema. */
  tagVisitor?: TagVisitor;
}

/**
 * ParseResult contains a parsed policy and its diagnostics.
 */
export interface ParseResult {
  /** policy contains the parsed model when no diagnostics were produced. */
  policy?: Policy;
  /** issues contains all parser diagnostics. */
  issues: Issues;
}

/**
 * parser creates a parser configured with a plain option object.
 */
export function parser(options: ParserOptions = {}): Parser {
  return new Parser(options);
}

/**
 * parse parses a YAML policy with an optional parser configuration.
 */
export function parse(source: Source, options: ParserOptions = {}): ParseResult {
  return parser(options).parse(source);
}

/**
 * Parser parses policy files into the canonical Policy representation.
 */
export class Parser {
  /** optionsValue stores immutable parser behavior. */
  private readonly optionsValue: Required<ParserOptions>;

  /** constructor configures policy parsing. Prefer {@link parser} for public use. */
  public constructor(options: ParserOptions = {}) {
    this.optionsValue = {
      simpleVariables: options.simpleVariables ?? false,
      tagVisitor: options.tagVisitor ?? defaultTagVisitor(),
    };
  }

  /**
   * parse generates a policy while tracking CEL expressions relative to the complete YAML file.
   */
  public parse(source: Source): ParseResult {
    const info = sourceInfo(source);
    const diagnostics = issues({ errors: errorsValue(source), sourceInfo: info });
    let decoded: unknown;
    try {
      // json mode accepts repeated custom keys, matching the policy visitor's last-value behavior.
      decoded = load(source.content(), { json: true });
    } catch (error) {
      diagnostics.reportErrorAtId({
        id: 0,
        message: "%s",
        args: [error instanceof Error ? error.message : String(error)],
      });
      return { issues: diagnostics };
    }

    const implementation = new ParserImplementation({
      source,
      sourceInfo: info,
      issues: diagnostics,
      options: this.optionsValue,
    });
    const parsed = implementation.parseDocument(decoded);
    return diagnostics.err() ? { issues: diagnostics } : { policy: parsed, issues: diagnostics };
  }
}

/**
 * ParserImplementationOptions configures one parse operation.
 */
interface ParserImplementationOptions {
  /** source is the complete policy source. */
  source: Source;
  /** sourceInfo receives expression offset ranges. */
  sourceInfo: SourceInfo;
  /** issues accumulates parser diagnostics. */
  issues: Issues;
  /** options contains parser behavior. */
  options: Required<ParserOptions>;
}

/**
 * ParserImplementation owns state for a single policy parse.
 */
class ParserImplementation implements ParserContext {
  /** idValue is the last allocated source identifier. */
  private idValue = 0;
  /** searchOffset advances best-effort YAML source association monotonically. */
  private searchOffset = 0;

  /** constructor initializes one parser operation. */
  public constructor(private readonly options: ParserImplementationOptions) {}

  /** nextId returns a monotonically increasing identifier for a source fragment. */
  public nextId(): number {
    this.idValue += 1;
    return this.idValue;
  }

  /** stringValue creates a source-associated string value. */
  public stringValue(value: unknown, fieldName = ""): ValueString {
    const fieldId = this.collectMetadata(fieldName);
    return this.stringAt(value, fieldId);
  }

  /** stringAt creates a string associated with an already collected YAML field. */
  private stringAt(value: unknown, fieldId: number): ValueString {
    const id = this.collectValueMetadata(fieldId);
    if (typeof value !== "string") {
      this.reportErrorAtId(
        id,
        "got yaml node type %s, wanted type(s) [tag:yaml.org,2002:str !txt]",
        yamlTag(value),
      );
      return { id, value: "*error*" };
    }
    return { id, value: this.blockScalarContent(fieldId, value) ?? value };
  }

  /**
   * blockScalarContent recovers an embedded CEL block scalar with its original indentation.
   *
   * Go's YAML node representation retains the source indentation used by CEL triple-quoted
   * strings. `js-yaml` returns only the normalized scalar value, so policy expressions recover
   * their raw block lines before CEL parsing.
   */
  private blockScalarContent(fieldId: number, decoded: string): string | undefined {
    if (!decoded.includes("'''") && !decoded.includes('"""')) {
      return undefined;
    }
    const source = this.options.source.content();
    const [range, found] = this.options.sourceInfo.getOffsetRange(fieldId);
    if (!found || !range) {
      return undefined;
    }
    const headerStart = source.lastIndexOf("\n", range.start) + 1;
    const headerEndValue = source.indexOf("\n", range.start);
    const headerEnd = headerEndValue < 0 ? source.length : headerEndValue;
    const header = source.slice(headerStart, headerEnd);
    const colon = header.indexOf(":", range.start - headerStart);
    if (colon < 0) {
      return undefined;
    }
    const indicator = header.slice(colon + 1).trim();
    const block = /^[>|]([+-])?/.exec(indicator);
    if (!block) {
      return undefined;
    }

    const headerIndent = header.search(/\S/);
    const lines: string[] = [];
    let lineStart = headerEnd < source.length ? headerEnd + 1 : source.length;
    while (lineStart < source.length) {
      const lineEndValue = source.indexOf("\n", lineStart);
      const lineEnd = lineEndValue < 0 ? source.length : lineEndValue;
      const line = source.slice(lineStart, lineEnd);
      const nonspace = line.search(/\S/);
      if (nonspace >= 0 && nonspace <= headerIndent) {
        break;
      }
      lines.push(line);
      lineStart = lineEnd < source.length ? lineEnd + 1 : source.length;
    }
    // YAML removes the block indentation from the first content line. Preserve the
    // physical indentation on later lines because CEL raw strings observe it.
    if (lines.length > 0) {
      lines[0] = lines[0]!.trimStart();
    }
    const trailingNewline = block[1] === "-" ? "" : "\n";
    return `${lines.join("\n")}${trailingNewline}`;
  }

  /** reportErrorAtId records a parser diagnostic. */
  public reportErrorAtId(id: number, message: string, ...args: unknown[]): void {
    this.options.issues.reportErrorAtId({ id, message, args });
  }

  /** parseDocument parses a decoded YAML document as the top-level policy. */
  public parseDocument(value: unknown): Policy {
    const parsed = policy(this.options.source, this.options.sourceInfo);
    const id = this.collectMetadata();
    if (!isMap(value)) {
      this.wrongType(id, value, "tag:yaml.org,2002:map");
      return parsed;
    }
    for (const [fieldName, fieldValue] of Object.entries(value)) {
      const fieldId = this.collectMetadata(fieldName);
      switch (fieldName) {
        case "imports":
          this.parseImports(parsed, fieldValue, fieldId);
          break;
        case "name":
          parsed.setName(this.stringAt(fieldValue, fieldId));
          break;
        case "description":
          parsed.setDescription(this.stringAt(fieldValue, fieldId));
          this.options.options.tagVisitor.policyTag({
            context: this,
            id: fieldId,
            tagName: fieldName,
            value: fieldValue,
            policy: parsed,
          });
          break;
        case "rule":
          parsed.setRule(
            this.parseRule({
              policy: parsed,
              value: fieldValue,
              id: fieldId,
            }),
          );
          break;
        default:
          this.options.options.tagVisitor.policyTag({
            context: this,
            id: fieldId,
            tagName: fieldName,
            value: fieldValue,
            policy: parsed,
          });
      }
    }
    return parsed;
  }

  /** parseImports adds decoded imports to a policy. */
  private parseImports(parsed: Policy, value: unknown, id: number): void {
    if (!Array.isArray(value)) {
      this.wrongType(this.collectValueMetadata(id), value, "tag:yaml.org,2002:seq");
      return;
    }
    for (const entry of value) {
      const importId = this.collectMetadata("name");
      const imported = importValue(importId);
      if (!isMap(entry)) {
        this.wrongType(importId, entry, "tag:yaml.org,2002:map");
      } else if ("name" in entry) {
        const nameId = this.collectMetadata("name");
        imported.setName(this.stringAt(entry.name, nameId));
      }
      parsed.addImport(imported);
    }
  }

  /** parseRule parses a decoded YAML value as a rule. */
  public parseRule(options: ParseRuleOptions): Rule {
    const parsedRule = rule(options.id);
    if (!isMap(options.value)) {
      this.wrongType(this.collectValueMetadata(options.id), options.value, "tag:yaml.org,2002:map");
      return parsedRule;
    }
    for (const [fieldName, fieldValue] of Object.entries(options.value)) {
      const fieldId = this.collectMetadata(fieldName);
      switch (fieldName) {
        case "id":
          parsedRule.setId(this.stringAt(fieldValue, fieldId));
          break;
        case "description":
          parsedRule.setDescription(this.stringAt(fieldValue, fieldId));
          break;
        case "variables":
          this.parseVariables(options.policy, parsedRule, fieldValue, fieldId);
          break;
        case "match":
          if (parsedRule.semantic() === "aggregate") {
            this.reportErrorAtId(fieldId, "rule must specify only one of match or aggregate");
          }
          this.parseMatches(options.policy, parsedRule, fieldValue, fieldId);
          break;
        case "aggregate":
          if (parsedRule.matches().length > 0) {
            this.reportErrorAtId(fieldId, "rule must specify only one of match or aggregate");
          }
          parsedRule.setSemantic("aggregate");
          this.parseMatches(options.policy, parsedRule, fieldValue, fieldId);
          break;
        default:
          this.options.options.tagVisitor.ruleTag({
            context: this,
            id: fieldId,
            tagName: fieldName,
            value: fieldValue,
            policy: options.policy,
            rule: parsedRule,
          });
      }
    }
    return parsedRule;
  }

  /** parseVariables adds decoded variables to a rule. */
  private parseVariables(parsed: Policy, parsedRule: Rule, value: unknown, id: number): void {
    if (!Array.isArray(value)) {
      this.wrongType(this.collectValueMetadata(id), value, "tag:yaml.org,2002:seq");
      return;
    }
    for (const entry of value) {
      parsedRule.addVariable(this.parseVariable(parsed, entry));
    }
  }

  /** parseVariable parses a decoded YAML value as a variable. */
  private parseVariable(parsed: Policy, value: unknown): Variable {
    const id = this.collectMetadata();
    const parsedVariable = variable(id);
    if (!isMap(value)) {
      this.wrongType(id, value, "tag:yaml.org,2002:map");
      return parsedVariable;
    }
    if (this.options.options.simpleVariables) {
      const entries = Object.entries(value);
      if (entries.length > 0) {
        const nameId = this.collectMetadata(entries[0]![0]);
        parsedVariable.setName({ id: nameId, value: entries[0]![0] });
        parsedVariable.setExpression(this.stringAt(entries[0]![1], nameId));
      }
      if (entries.length > 1) {
        this.reportErrorAtId(id, "only one variable may be defined inline");
      }
      return parsedVariable;
    }
    for (const [fieldName, fieldValue] of Object.entries(value)) {
      const fieldId = this.collectMetadata(fieldName);
      if (fieldName === "name") {
        parsedVariable.setName(this.stringAt(fieldValue, fieldId));
      } else if (fieldName === "expression") {
        parsedVariable.setExpression(this.stringAt(fieldValue, fieldId));
      } else {
        this.options.options.tagVisitor.variableTag({
          context: this,
          id: fieldId,
          tagName: fieldName,
          value: fieldValue,
          policy: parsed,
          variable: parsedVariable,
        });
      }
    }
    return parsedVariable;
  }

  /** parseMatches adds decoded matches to a rule. */
  private parseMatches(parsed: Policy, parsedRule: Rule, value: unknown, id: number): void {
    if (!Array.isArray(value)) {
      this.wrongType(this.collectValueMetadata(id), value, "tag:yaml.org,2002:seq");
      return;
    }
    for (const entry of value) {
      parsedRule.addMatch(
        this.parseMatch({
          policy: parsed,
          value: entry,
          id: this.collectMetadata(),
        }),
      );
    }
  }

  /** parseMatch parses a decoded YAML value as a match. */
  public parseMatch(options: ParseMatchOptions): Match {
    const parsedMatch = match(options.id);
    if (!isMap(options.value)) {
      this.wrongType(options.id, options.value, "tag:yaml.org,2002:map");
      return parsedMatch;
    }
    parsedMatch.setCondition({ id: this.nextId(), value: "true" });
    for (const [fieldName, fieldValue] of Object.entries(options.value)) {
      const fieldId = this.collectMetadata(fieldName);
      switch (fieldName) {
        case "condition":
          parsedMatch.setCondition(this.stringAt(fieldValue, fieldId));
          break;
        case "output":
          if (parsedMatch.hasRule()) {
            this.reportErrorAtId(fieldId, "only the rule or the output may be set");
          }
          parsedMatch.setOutput(this.stringAt(fieldValue, fieldId));
          break;
        case "explanation":
          if (parsedMatch.hasRule()) {
            this.reportErrorAtId(
              fieldId,
              "explanation can only be set on output match cases, not nested rules",
            );
          }
          parsedMatch.setExplanation(this.stringAt(fieldValue, fieldId));
          break;
        case "rule":
          if (parsedMatch.hasOutput()) {
            this.reportErrorAtId(fieldId, "only the rule or the output may be set");
          }
          if (parsedMatch.hasExplanation()) {
            this.reportErrorAtId(
              fieldId,
              "explanation can only be set on output match cases, not nested rules",
            );
          }
          parsedMatch.setRule(
            this.parseRule({
              policy: options.policy,
              value: fieldValue,
              id: fieldId,
            }),
          );
          break;
        default:
          this.options.options.tagVisitor.matchTag({
            context: this,
            id: fieldId,
            tagName: fieldName,
            value: fieldValue,
            policy: options.policy,
            match: parsedMatch,
          });
      }
    }
    if (!parsedMatch.hasOutput() && !parsedMatch.hasRule()) {
      this.reportErrorAtId(options.id, "match does not specify a rule or output");
    }
    return parsedMatch;
  }

  /** collectMetadata allocates an id and records a best-effort field offset. */
  private collectMetadata(fieldName = ""): number {
    const id = this.nextId();
    let offset = this.searchOffset;
    if (fieldName) {
      const source = this.options.source.content();
      const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?:^|\\n)([ \\t]*(?:- )?)(${escaped})(?=\\s*:)`, "g");
      // Begin at the current line boundary so fields on `- field:` sequence lines
      // remain visible after the sequence item itself has been associated.
      const precedingNewline = source.lastIndexOf("\n", Math.max(0, this.searchOffset - 1));
      pattern.lastIndex = precedingNewline < 0 ? 0 : precedingNewline;
      const found = pattern.exec(source);
      if (found) {
        offset = found.index + (found[0].startsWith("\n") ? 1 : 0) + found[1]!.length;
        const lineEnd = source.indexOf("\n", offset);
        this.searchOffset = lineEnd < 0 ? source.length : lineEnd + 1;
      }
    } else {
      const source = this.options.source.content();
      const pattern =
        this.searchOffset === 0
          ? /(?:^|\n)([ \t]*)(?:- ([^\s#])|([^\s#]))/g
          : /(?:^|\n)([ \t]*)- ([^\s#])/g;
      const precedingNewline = source.lastIndexOf("\n", Math.max(0, this.searchOffset - 1));
      pattern.lastIndex = precedingNewline < 0 ? 0 : precedingNewline;
      const found = pattern.exec(source);
      if (found) {
        const lineStart = found.index + (found[0].startsWith("\n") ? 1 : 0);
        offset = lineStart + found[1]!.length + (found[2] !== undefined ? 2 : 0);
        // Retain the line start so a named field on the same sequence line can be found.
        this.searchOffset = lineStart;
      }
    }
    this.options.sourceInfo.setOffsetRange(id, { start: offset, stop: offset });
    return id;
  }

  /** collectValueMetadata associates an id with a mapping value or its first child. */
  private collectValueMetadata(fieldId: number): number {
    const id = this.nextId();
    const source = this.options.source.content();
    const range = this.options.sourceInfo.getOffsetRange(fieldId)[0];
    let offset = range?.start ?? 0;
    const lineEnd = source.indexOf("\n", offset);
    const end = lineEnd < 0 ? source.length : lineEnd;
    const colon = source.indexOf(":", offset);
    if (colon >= 0 && colon < end) {
      const inline = source.slice(colon + 1, end);
      const nonspace = inline.search(/\S/);
      if (nonspace >= 0) {
        const scalarIndicator = inline.slice(nonspace).trim();
        if (/^[>|]/.test(scalarIndicator)) {
          // Block scalar expressions retain their physical indentation, so their relative
          // source begins at the following policy line rather than at the YAML indicator.
          offset = end < source.length ? end + 1 : end;
        } else {
          offset = colon + 1 + nonspace;
        }
      } else {
        const child = /(?:^|\n)([ \t]*)(?:- )?([^\s#])/g;
        child.lastIndex = end;
        const found = child.exec(source);
        if (found) {
          const lineStart = found.index + (found[0].startsWith("\n") ? 1 : 0);
          offset =
            lineStart +
            found[1]!.length +
            (source.slice(lineStart).startsWith(`${found[1]}- `) ? 2 : 0);
        }
      }
    }
    this.options.sourceInfo.setOffsetRange(id, { start: offset, stop: offset });
    return id;
  }

  /** wrongType reports a YAML type mismatch. */
  private wrongType(id: number, value: unknown, wanted: string): void {
    this.reportErrorAtId(id, "got yaml node type %s, wanted type(s) [%s]", yamlTag(value), wanted);
  }
}

/**
 * isMap reports whether a decoded YAML value is a mapping.
 */
function isMap(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
  );
}

/**
 * yamlTag returns the canonical YAML long tag for a decoded value.
 */
function yamlTag(value: unknown): string {
  if (Array.isArray(value)) return "tag:yaml.org,2002:seq";
  if (isMap(value)) return "tag:yaml.org,2002:map";
  if (value === null) return "tag:yaml.org,2002:null";
  if (typeof value === "boolean") return "tag:yaml.org,2002:bool";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "tag:yaml.org,2002:int" : "tag:yaml.org,2002:float";
  }
  if (value instanceof Date) return "tag:yaml.org,2002:timestamp";
  return "tag:yaml.org,2002:str";
}
