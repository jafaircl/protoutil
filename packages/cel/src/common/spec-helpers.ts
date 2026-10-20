import syncedTestCases from "../../testdata/cel-go/cel-go-test-cases.json";
import {
  type Doc,
  DocKind,
  exampleDoc,
  fieldDoc,
  functionDoc,
  macroDoc,
  overloadDoc,
  variableDoc,
} from "./doc.js";

const jsonCases = syncedTestCases as Record<string, unknown>;

export function syncedCases<T>(name: string): T[] {
  return (jsonCases[name] as T[] | undefined) ?? [];
}

export function resolveContainerExpr(value: unknown): string {
  const expr = (value as { $expr?: string } | undefined)?.$expr;
  switch (expr) {
    case '"abbreviation collides with existing reference: " +\n\t\t\t\t"name=yer.other.R, abbreviation=R, existing=my.alias.R"':
      return "abbreviation collides with existing reference: name=yer.other.R, abbreviation=R, existing=my.alias.R";
    case '"abbreviation collides with container name: name=my.alias.a, " +\n\t\t\t\t"abbreviation=a, container=a.b.c.M.N"':
      return "abbreviation collides with container name: name=my.alias.a, abbreviation=a, container=a.b.c.M.N";
    default:
      return value as string;
  }
}

export function resolveAliasExpr(value: { $expr?: string }): {
  qualifiedName: string;
  alias: string;
} {
  const expr = value.$expr ?? "";
  const match = /^\{name: "((?:[^"\\]|\\.)*)", alias: "((?:[^"\\]|\\.)*)"\}$/.exec(expr);
  if (!match) {
    throw new Error(`unsupported container alias expr: ${value.$expr}`);
  }
  return { qualifiedName: unquoteGoString(match[1]!), alias: unquoteGoString(match[2]!) };
}

export function resolveDocKind(value: { $expr?: string }): DocKind {
  switch (value.$expr) {
    case "DocMacro":
      return DocKind.Macro;
    case "DocVariable":
      return DocKind.Variable;
    case "DocFunction":
      return DocKind.Function;
    case "DocField":
      return DocKind.Field;
    default:
      throw new Error(`unsupported doc kind expr: ${value.$expr}`);
  }
}

export function resolveNewDoc(value: { $expr?: string }): Doc {
  const expr = value.$expr ?? "";
  const match = /^func\(\) \*Doc \{\s*return ([\s\S]+)\s*\}$/.exec(expr);
  if (!match) {
    throw new Error(`unsupported new doc expr: ${value.$expr}`);
  }
  return parseDocCall(match[1]!.trim());
}

function parseDocCall(expr: string): Doc {
  const match = /^(New[A-Za-z]+Doc)\(([\s\S]*)\)$/.exec(expr);
  if (!match) {
    throw new Error(`unsupported doc constructor expr: ${expr}`);
  }
  const ctor = match[1]!;
  const args = splitArgs(match[2]!);
  switch (ctor) {
    case "NewExampleDoc":
      return exampleDoc(unquoteArg(args[0]!));
    case "NewMacroDoc":
      return macroDoc(
        unquoteArg(args[0]!),
        unquoteArg(args[1]!),
        ...args.slice(2).map(parseDocCall),
      );
    case "NewVariableDoc":
      return variableDoc(unquoteArg(args[0]!), unquoteArg(args[1]!), unquoteArg(args[2]!));
    case "NewFunctionDoc":
      return functionDoc(
        unquoteArg(args[0]!),
        unquoteArg(args[1]!),
        ...args.slice(2).map(parseDocCall),
      );
    case "NewOverloadDoc":
      return overloadDoc(
        unquoteArg(args[0]!),
        unquoteArg(args[1]!),
        ...args.slice(2).map(parseDocCall),
      );
    case "NewFieldDoc":
      return fieldDoc(
        unquoteArg(args[0]!),
        unquoteArg(args[1]!),
        unquoteArg(args[2]!),
        ...args.slice(3).map(parseDocCall),
      );
    default:
      throw new Error(`unsupported doc constructor expr: ${expr}`);
  }
}

function splitArgs(source: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const prev = i > 0 ? source[i - 1] : "";
    if (char === '"' && prev !== "\\") {
      inString = !inString;
    } else if (!inString && char === "(") {
      depth += 1;
    } else if (!inString && char === ")") {
      depth -= 1;
    } else if (!inString && depth === 0 && char === ",") {
      out.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(source.slice(start).trim());
  return out.filter((entry) => entry.length > 0);
}

function unquoteArg(value: string): string {
  return unquoteGoString(value.replace(/^"/, "").replace(/"$/, ""));
}

function unquoteGoString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\");
}
