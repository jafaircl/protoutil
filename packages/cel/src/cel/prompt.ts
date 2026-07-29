import type { Doc } from "../common/doc.js";
import * as operators from "../common/operators.js";
import * as overloads from "../common/overloads.js";
import { Kind } from "../common/types/types.js";
import type { Macro } from "../parser/options.js";
import type { Env } from "./env.js";
import { fieldPathsForType } from "./field-paths.js";

/**
 * DefaultPersona indicates the kind of user making an AI-assisted CEL authoring request.
 */
const DefaultPersona = `You are a software engineer with expertise in networking and application security
authoring boolean Common Expression Language (CEL) expressions to ensure firewall,
networking, authentication, and data access is only permitted when all conditions
are satisfied.`;

/**
 * DefaultFormatRules describe how an LLM should format a generated CEL expression.
 */
const DefaultFormatRules = `Output your response as a CEL expression.

Write the expression with the comment on the first line and the expression on the
subsequent lines. Format the expression using 80-character line limits commonly
found in C++ or Java code.`;

/**
 * DefaultGeneralUsage provides the CEL literal and aggregate guidance included in prompts.
 */
const DefaultGeneralUsage = `CEL supports Protocol Buffer and JSON types, as well as simple types and aggregate types.

Simple types include bool, bytes, double, int, string, and uint:

* double literals must always include a decimal point: 1.0, 3.5, -2.2
* uint literals must be positive values suffixed with a 'u': 42u
* byte literals are strings prefixed with a 'b': b'1235'
* string literals can use either single quotes or double quotes: 'hello', "world"
* string literals can also be treated as raw strings that do not require any
  escaping within the string by using the 'R' prefix: R"""quote: "hi" """

Aggregate types include list and map:

* list literals consist of zero or more values between brackets: "['a', 'b', 'c']"
* map literal consist of colon-separated key-value pairs within braces: "{'key1': 1, 'key2': 2}"
* Only int, uint, string, and bool types are valid map keys.
* Maps containing HTTP headers must always use lower-cased string keys.

Comments start with two-forward slashes followed by text and a newline.`;

/**
 * HiddenFunctions contains internal or deprecated declarations omitted from authoring prompts.
 */
const HiddenFunctions = new Set([
  overloads.DeprecatedIn,
  operators.OldIn,
  operators.OldNotStrictlyFalse,
  operators.NotStrictlyFalse,
]);

/**
 * PromptVariable associates a variable document with its reachable field documents.
 */
interface PromptVariable {
  /** Documentation describes the root environment variable. */
  documentation: Doc;
  /** FieldPaths describe fields reachable from a structure variable. */
  fieldPaths: Doc[];
}

/**
 * Prompt represents the core components of an LLM prompt based on a CEL environment.
 *
 * All public fields may be overwritten before rendering the prompt to a human-readable string.
 */
export class Prompt {
  /** Persona indicates something about the kind of user making the request. */
  public persona = DefaultPersona;

  /** FormatRules indicate how the LLM should generate its output. */
  public formatRules = DefaultFormatRules;

  /** GeneralUsage specifies additional context on how CEL should be used. */
  public generalUsage = DefaultGeneralUsage;

  /**
   * Creates a prompt associated with an environment.
   */
  public constructor(
    /** Environment supplies the variables, functions, macros, and types documented by the prompt. */
    private readonly environment: Env,
    /** IncludeFieldPaths controls whether reachable structure fields are documented. */
    private readonly includeFieldPaths = false,
  ) {}

  /**
   * Render renders the user prompt with the associated context from the prompt template
   * for use with LLM generators.
   *
   * User-supplied input is appended as a literal string value. Template action delimiters
   * such as `{{.Persona}}` in the user prompt are never evaluated as template directives.
   */
  public render(userPrompt: string): string {
    const sections = [this.persona, this.formatRules];
    const variables = this.promptVariables();
    const macros = this.environment.macros();
    const functions = [...this.environment.functions().values()]
      .filter((fn) => !HiddenFunctions.has(fn.name()))
      .map((fn) => fn.documentation())
      .sort(compareDocs);

    if (variables.length !== 0 || macros.length !== 0 || functions.length !== 0) {
      sections.push("Only use the following variables, macros, and functions in expressions.");
    }
    if (variables.length !== 0) {
      sections.push(`Variables:\n\n${variables.map(renderVariable).join("\n")}`);
    }
    if (macros.length !== 0) {
      sections.push(`Macros:\n\n${macros.map(renderMacro).join("\n")}`);
    }
    if (functions.length !== 0) {
      sections.push(`Functions:\n\n${functions.map(renderFunction).join("\n")}`);
    }
    sections.push(this.generalUsage, userPrompt);
    return `${sections.join("\n\n")}\n`;
  }

  /**
   * Collects sorted variable documentation and optional reachable field paths.
   */
  private promptVariables(): PromptVariable[] {
    const variables = this.environment.variables().map((variable) => {
      const promptVariable: PromptVariable = {
        documentation: variable.documentation(),
        fieldPaths: [],
      };
      if (!this.includeFieldPaths || variable.type().kind() !== Kind.Struct) {
        return promptVariable;
      }

      const paths = fieldPathsForType({
        provider: this.environment.typeProvider(),
        identifier: variable.name(),
        type: variable.type(),
      });
      // The first path is the variable itself, which is already documented.
      promptVariable.fieldPaths = paths
        .slice(1)
        .map((path) => path.documentation())
        .sort(compareDocs);
      return promptVariable;
    });
    return variables.sort((left, right) =>
      left.documentation.name.localeCompare(right.documentation.name),
    );
  }
}

/**
 * AuthoringPrompt creates a prompt from a CEL environment for AI-assisted authoring.
 */
export function authoringPrompt(environment: Env): Prompt {
  return new Prompt(environment);
}

/**
 * AuthoringPromptWithFieldPaths creates a prompt that includes documentation for all reachable
 * field paths in the environment.
 */
export function authoringPromptWithFieldPaths(environment: Env): Prompt {
  return new Prompt(environment, true);
}

/**
 * Compares documentation by name while preserving stable order for equivalent names.
 */
function compareDocs(left: Doc, right: Doc): number {
  return left.name.localeCompare(right.name);
}

/**
 * Splits a description into lines after trimming common prefix whitespace and trailing newlines.
 */
function splitDescription(description: string): string[] {
  const lines = description.trimEnd().split("\n");
  if (lines.length === 0) {
    return [];
  }
  const prefix = lines[0]!.match(/^[ \t]*/)?.[0] ?? "";
  if (prefix.length === 0 || lines.some((line) => line.length !== 0 && !line.startsWith(prefix))) {
    return lines;
  }
  return lines.map((line) => (line.length === 0 ? "" : line.slice(prefix.length)));
}

/**
 * Renders a variable and its reachable field documentation.
 */
function renderVariable(variable: PromptVariable): string {
  const doc = variable.documentation;
  const lines = [`* name: \`${doc.name}\``, `  type: \`${doc.type}\``];
  if (doc.description.length !== 0) {
    lines.push("  description:");
    lines.push(...splitDescription(doc.description).map((line) => `    ${line}`));
  }
  if (variable.fieldPaths.length !== 0) {
    lines.push("", "  attributes:");
    for (const fieldPath of variable.fieldPaths) {
      lines.push(`    * path: \`${fieldPath.name}\``, `      type: \`${fieldPath.type}\``);
      if (fieldPath.description.length !== 0) {
        lines.push("      description:");
        lines.push(...splitDescription(fieldPath.description).map((line) => `        ${line}`));
      }
      lines.push("");
    }
    lines.pop();
  }
  return lines.join("\n");
}

/**
 * Renders a macro and its examples.
 */
function renderMacro(macro: Macro): string {
  const doc = macro.documentation?.();
  const name = doc?.name ?? macro.function;
  const description = doc?.description.replaceAll("\n", " ") ?? "";
  const lines = [`* ${name} macro${description.length === 0 ? "" : ` - ${description}`}`];
  for (const example of doc?.children ?? []) {
    lines.push("", ...splitDescription(example.description).map((line) => `      ${line}`));
  }
  return lines.join("\n");
}

/**
 * Renders a function and its overload signatures or examples.
 */
function renderFunction(doc: Doc): string {
  const description = doc.description.replaceAll("\n", " ");
  const lines = [`* ${doc.name}${description.length === 0 ? "" : ` - ${description}`}`];
  for (const overload of doc.children) {
    const examples = overload.children.map((example) => example.description);
    lines.push(
      "",
      ...(examples.length === 0
        ? [`      ${overload.signature}`]
        : examples.flatMap((example) => splitDescription(example).map((line) => `      ${line}`))),
    );
  }
  return lines.join("\n");
}
