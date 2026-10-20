import { syncedCases } from "../common/spec-helpers.js";
import { Uint } from "../common/types/index.js";
import { type AttributePattern, attributePattern } from "./attribute-patterns.js";

/**
 * SyncedPatternCase describes a decoded row from the synced cel-go attribute pattern table.
 */
export interface SyncedPatternCase {
  /**
   * name is the map key of the upstream `patternTests` entry.
   */
  name: string;

  /**
   * pattern is the decoded attribute pattern for the row.
   */
  pattern: AttributePattern;

  /**
   * matches contains the decoded match inputs for the row.
   */
  matches: SyncedAttrCase[];

  /**
   * misses contains the decoded miss inputs for the row.
   */
  misses: SyncedAttrCase[];
}

/**
 * SyncedAttrCase describes a decoded attribute-pattern test input.
 */
export interface SyncedAttrCase {
  /**
   * unchecked indicates whether the attribute path came from an unchecked expression.
   */
  unchecked?: boolean;

  /**
   * container contains the simulated CEL container for unchecked inputs.
   */
  container?: string;

  /**
   * name is the base variable name for the attribute under test.
   */
  name: string;

  /**
   * quals contains the decoded qualifier values for the attribute path.
   */
  quals?: unknown[];
}

/**
 * resolveAttributePatternCases loads and decodes the synced cel-go table rows for attribute pattern specs.
 */
export function resolveAttributePatternCases(name: string): SyncedPatternCase[] {
  return syncedCases<Record<string, unknown>>(name).map((value) => ({
    name: value.name as string,
    pattern: resolveAttributePatternExpr(value.pattern as { $expr?: string }),
    matches: ((value.matches as unknown[]) ?? []).map(resolveAttrCase),
    misses: ((value.misses as unknown[]) ?? []).map(resolveAttrCase),
  }));
}

/**
 * resolveAttrCase decodes one synced attribute-pattern test input row.
 */
export function resolveAttrCase(value: unknown): SyncedAttrCase {
  const expr = (value as { $expr?: string } | undefined)?.$expr;
  if (expr) {
    return resolveAttrCaseExpr(expr);
  }
  const record = value as Record<string, unknown>;
  return {
    unchecked: record.unchecked as boolean | undefined,
    container: record.container as string | undefined,
    name: record.name as string,
    quals: ((record.quals as unknown[]) ?? []).map(resolveQualifierExpr),
  };
}

/**
 * resolveAttrCaseExpr decodes a fallback-encoded Go composite literal for an attribute test input.
 */
export function resolveAttrCaseExpr(expr: string): SyncedAttrCase {
  const nameMatch = /name:\s*"((?:[^"\\]|\\.)*)"/.exec(expr);
  if (!nameMatch) {
    throw new Error(`unsupported attr case expr: ${expr}`);
  }
  const qualsMatch = /quals:\s*\[]any\{([\s\S]*?)\}/.exec(expr);
  const uncheckedMatch = /unchecked:\s*(true|false)/.exec(expr);
  const containerMatch = /container:\s*"((?:[^"\\]|\\.)*)"/.exec(expr);
  return {
    name: unquoteGoString(nameMatch[1]!),
    quals: qualsMatch ? splitArgs(qualsMatch[1]!).map(resolveQualifierExpr) : [],
    unchecked: uncheckedMatch?.[1] === "true",
    container: containerMatch ? unquoteGoString(containerMatch[1]!) : undefined,
  };
}

/**
 * resolveAttributePatternExpr decodes chained `NewAttributePattern(...).Qual...()` expressions from synced testdata.
 */
export function resolveAttributePatternExpr(value: { $expr?: string }): AttributePattern {
  const expr = value.$expr ?? "";
  const match = /^NewAttributePattern\("((?:[^"\\]|\\.)*)"\)([\s\S]*)$/.exec(expr);
  if (!match) {
    throw new Error(`unsupported attribute pattern expr: ${value.$expr}`);
  }
  const out = attributePattern(unquoteGoString(match[1]!));
  const suffix = match[2] ?? "";
  const opPattern = /\.([A-Za-z]+)\(([^()]*)\)/g;
  let opMatch: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: TODO
  while ((opMatch = opPattern.exec(suffix)) !== null) {
    const op = opMatch[1]!;
    const arg = opMatch[2]!.trim();
    switch (op) {
      case "QualString":
        out.qualString(unquoteQuotedArg(arg));
        break;
      case "QualInt":
        out.qualInt(Number(stripNumericWrapper(arg)));
        break;
      case "QualUint":
        out.qualUint(BigInt(stripNumericWrapper(arg)));
        break;
      case "QualBool":
        out.qualBool(arg === "true");
        break;
      case "Wildcard":
        out.wildcard();
        break;
      default:
        throw new Error(`unsupported attribute pattern op: ${op}`);
    }
  }
  return out;
}

/**
 * resolveQualifierExpr decodes synced qualifier expressions into the local runtime values used by the spec.
 */
export function resolveQualifierExpr(value: unknown): unknown {
  const expr =
    typeof value === "string" ? value : ((value as { $expr?: string } | undefined)?.$expr ?? "");
  if (/^"(?:[^"\\]|\\.)*"$/.test(expr)) {
    return unquoteQuotedArg(expr);
  }
  if (/^int(?:32|64)?\(/.test(expr)) {
    return Number(stripNumericWrapper(expr));
  }
  if (/^float(?:32|64)?\(/.test(expr)) {
    return Number(stripNumericWrapper(expr));
  }
  if (/^uint(?:32|64)?\(/.test(expr)) {
    return new Uint(BigInt(stripNumericWrapper(expr)));
  }
  if (expr === "true") {
    return true;
  }
  if (expr === "false") {
    return false;
  }
  if (expr === "nil") {
    return null;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value;
  }
  throw new Error(`unsupported qualifier expr: ${JSON.stringify(value)}`);
}

/**
 * stripNumericWrapper removes a Go numeric helper call like `int64(0)` around its literal payload.
 */
function stripNumericWrapper(value: string): string {
  const match = /^[A-Za-z0-9_]+\(([\s\S]+)\)$/.exec(value.trim());
  return match ? match[1]!.trim() : value.trim();
}

/**
 * unquoteQuotedArg removes the surrounding quotes from a Go string literal argument.
 */
function unquoteQuotedArg(value: string): string {
  return unquoteGoString(value.replace(/^"/, "").replace(/"$/, ""));
}

/**
 * unquoteGoString decodes the small set of Go string escapes present in synced test expressions.
 */
function unquoteGoString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
}

/**
 * splitArgs splits a comma-separated Go argument list while respecting strings and nested calls.
 */
function splitArgs(source: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const prev = index > 0 ? source[index - 1] : "";
    if (char === '"' && prev !== "\\") {
      inString = !inString;
      continue;
    }
    if (!inString && char === "(") {
      depth += 1;
      continue;
    }
    if (!inString && char === ")") {
      depth -= 1;
      continue;
    }
    if (!inString && depth === 0 && char === ",") {
      out.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  out.push(source.slice(start).trim());
  return out.filter((entry) => entry.length > 0);
}
