/**
 * DocKind indicates the type of documentation element.
 */
export enum DocKind {
  Env = 1,
  Function = 2,
  Overload = 3,
  Variable = 4,
  Macro = 5,
  Example = 6,
  Field = 7,
}

/**
 * Doc holds the documentation details for a specific program element like
 * a variable, function, macro, or example.
 */
export class Doc {
  constructor(
    /** Kind specifies the type of documentation element. */
    public readonly kind: DocKind,
    /** Name is the identifier of the documented element. */
    public readonly name = "",
    /** Type is the CEL type associated with the element. */
    public readonly type = "",
    /** Signature represents the function or overload signature. */
    public readonly signature = "",
    /** Description holds the textual description of the element. */
    public readonly description = "",
    /** Children holds nested documentation elements. */
    public readonly children: Doc[] = [],
  ) {}
}

/**
 * Documentor is implemented by types that can provide their own documentation.
 */
export interface Documentor {
  /** Documentation returns the structured documentation for the value. */
  documentation(): Doc | undefined;
}

/**
 * MultilineDescription combines multiple lines into a newline separated string.
 */
export function multilineDescription(...lines: string[]): string {
  return lines.join("\n");
}

/**
 * ParseDescription removes blank lines and trailing whitespace from a documentation block.
 */
export function parseDescription(doc: string): string {
  const lines: string[] = [];
  if (doc.length !== 0) {
    for (const line of doc.split("\n")) {
      const trimmed = line.trimEnd();
      if (trimmed.length === 0) {
        continue;
      }
      lines.push(trimmed);
    }
  }
  return multilineDescription(...lines);
}

/**
 * ParseDescriptions splits a documentation string into multiple multiline sections.
 */
export function parseDescriptions(doc: string): string[] {
  const descriptions: string[] = [];
  if (doc.length === 0) {
    return descriptions;
  }
  const lines = doc.split("\n");
  let lineStart = 0;
  for (const [index, line] of lines.entries()) {
    if (line.trimEnd().length !== 0) {
      continue;
    }
    const section = lines.slice(lineStart, index);
    if (section.length !== 0) {
      descriptions.push(multilineDescription(...section));
    }
    lineStart = index + 1;
  }
  if (lineStart < lines.length) {
    descriptions.push(multilineDescription(...lines.slice(lineStart)));
  }
  return descriptions;
}

/**
 * VariableDoc creates documentation for a variable.
 */
export function variableDoc(name: string, celType: string, description: string): Doc {
  return new Doc(DocKind.Variable, name, celType, "", parseDescription(description));
}

/**
 * FunctionDoc creates documentation for a function.
 */
export function functionDoc(name: string, description: string, ...overloads: Doc[]): Doc {
  return new Doc(DocKind.Function, name, "", "", parseDescription(description), overloads);
}

/**
 * OverloadDoc creates documentation for a function overload.
 */
export function overloadDoc(id: string, signature: string, ...examples: Doc[]): Doc {
  return new Doc(DocKind.Overload, id, "", signature, "", examples);
}

/**
 * MacroDoc creates documentation for a macro.
 */
export function macroDoc(name: string, description: string, ...examples: Doc[]): Doc {
  return new Doc(DocKind.Macro, name, "", "", parseDescription(description), examples);
}

/**
 * ExampleDoc creates documentation for an example.
 */
export function exampleDoc(example: string): Doc {
  return new Doc(DocKind.Example, "", "", "", example);
}

/**
 * FieldDoc creates documentation for a field.
 */
export function fieldDoc(
  name: string,
  celType: string,
  description: string,
  ...examples: Doc[]
): Doc {
  return new Doc(DocKind.Field, name, celType, "", description, examples);
}
