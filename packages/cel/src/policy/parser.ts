import { load } from "js-yaml";
import { type Issues, issues } from "../cel/env.js";
import { type SourceInfo, sourceInfo } from "../common/ast/ast.js";
import { errorsValue } from "../common/errors.js";
import {
  type Match,
  match,
  type Policy,
  policy,
  policyImport,
  type Rule,
  rule,
  type ValueString,
  type Variable,
  variable,
} from "./models.js";
import type { PolicySource } from "./source.js";

/**
 * ParserContext exposes policy construction and diagnostic services to custom tag visitors.
 */
export interface ParserContext {
  /** nextId returns a monotonically increasing source identifier. */
  nextId(): number;
  /** stringValue creates a source-associated string value. */
  stringValue(value: unknown, fieldName?: string): ValueString;
  /** reportErrorAtId records a parser diagnostic. */
  reportErrorAtId(id: number, message: string, ...args: unknown[]): void;
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
 * ParsePolicyResult contains a parsed policy and its diagnostics.
 */
export interface ParsePolicyResult {
  /** policy contains the parsed model when no diagnostics were produced. */
  policy?: Policy;
  /** issues contains all parser diagnostics. */
  issues: Issues;
}

/**
 * policyParser creates a parser configured with a plain option object.
 */
export function policyParser(options: ParserOptions = {}): Parser {
  return new Parser(options);
}

/**
 * parsePolicy parses a YAML policy with an optional parser configuration.
 */
export function parsePolicy(source: PolicySource, options: ParserOptions = {}): ParsePolicyResult {
  return policyParser(options).parse(source);
}

/**
 * Parser parses policy files into the canonical Policy representation.
 */
export class Parser {
  /** optionsValue stores immutable parser behavior. */
  private readonly optionsValue: Required<ParserOptions>;

  /** constructor configures policy parsing. Prefer {@link policyParser} for public use. */
  public constructor(options: ParserOptions = {}) {
    this.optionsValue = {
      simpleVariables: options.simpleVariables ?? false,
      tagVisitor: options.tagVisitor ?? defaultTagVisitor(),
    };
  }

  /**
   * parse generates a policy while tracking CEL expressions relative to the complete YAML file.
   */
  public parse(source: PolicySource): ParsePolicyResult {
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
    const parsed = implementation.parsePolicy(decoded);
    return diagnostics.err() ? { issues: diagnostics } : { policy: parsed, issues: diagnostics };
  }
}

/**
 * ParserImplementationOptions configures one parse operation.
 */
interface ParserImplementationOptions {
  /** source is the complete policy source. */
  source: PolicySource;
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
    return { id, value };
  }

  /** reportErrorAtId records a parser diagnostic. */
  public reportErrorAtId(id: number, message: string, ...args: unknown[]): void {
    this.options.issues.reportErrorAtId({ id, message, args });
  }

  /** parsePolicy parses a decoded YAML document as the top-level policy. */
  public parsePolicy(value: unknown): Policy {
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
          parsed.setRule(this.parseRule(parsed, fieldValue, fieldId));
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
      const imported = policyImport(importId);
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
  private parseRule(parsed: Policy, value: unknown, id: number): Rule {
    const parsedRule = rule(id);
    if (!isMap(value)) {
      this.wrongType(this.collectValueMetadata(id), value, "tag:yaml.org,2002:map");
      return parsedRule;
    }
    for (const [fieldName, fieldValue] of Object.entries(value)) {
      const fieldId = this.collectMetadata(fieldName);
      switch (fieldName) {
        case "id":
          parsedRule.setId(this.stringAt(fieldValue, fieldId));
          break;
        case "description":
          parsedRule.setDescription(this.stringAt(fieldValue, fieldId));
          break;
        case "variables":
          this.parseVariables(parsed, parsedRule, fieldValue, fieldId);
          break;
        case "match":
          this.parseMatches(parsed, parsedRule, fieldValue, fieldId);
          break;
        default:
          this.options.options.tagVisitor.ruleTag({
            context: this,
            id: fieldId,
            tagName: fieldName,
            value: fieldValue,
            policy: parsed,
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
      parsedRule.addMatch(this.parseMatch(parsed, entry));
    }
  }

  /** parseMatch parses a decoded YAML value as a match. */
  private parseMatch(parsed: Policy, value: unknown): Match {
    const id = this.collectMetadata();
    const parsedMatch = match(id);
    if (!isMap(value)) {
      this.wrongType(id, value, "tag:yaml.org,2002:map");
      return parsedMatch;
    }
    parsedMatch.setCondition({ id: this.nextId(), value: "true" });
    for (const [fieldName, fieldValue] of Object.entries(value)) {
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
          parsedMatch.setRule(this.parseRule(parsed, fieldValue, fieldId));
          break;
        default:
          this.options.options.tagVisitor.matchTag({
            context: this,
            id: fieldId,
            tagName: fieldName,
            value: fieldValue,
            policy: parsed,
            match: parsedMatch,
          });
      }
    }
    if (!parsedMatch.hasOutput() && !parsedMatch.hasRule()) {
      this.reportErrorAtId(id, "match does not specify a rule or output");
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
      pattern.lastIndex = this.searchOffset;
      const found = pattern.exec(source);
      if (found) {
        offset = found.index + (found[0].startsWith("\n") ? 1 : 0) + found[1]!.length;
        const lineEnd = source.indexOf("\n", offset);
        this.searchOffset = lineEnd < 0 ? source.length : lineEnd + 1;
      }
    } else {
      const source = this.options.source.content();
      const pattern = /(?:^|\n)([ \t]*)(?:- ([^\s#])|([^\s#]))/g;
      pattern.lastIndex = this.searchOffset;
      const found = pattern.exec(source);
      if (found) {
        const lineStart = found.index + (found[0].startsWith("\n") ? 1 : 0);
        offset = lineStart + found[1]!.length + (found[2] !== undefined ? 2 : 0);
        this.searchOffset = offset;
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
        offset = colon + 1 + nonspace;
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
