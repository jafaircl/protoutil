import { type Expr, ExprKind } from "./ast/index.js";

const noAliases = new Map<string, string>();

/**
 * Container holds an optional qualified container name and alias set.
 */
export class Container {
  constructor(
    private readonly nameValue = "",
    private readonly aliasesValue = new Map<string, string>(),
  ) {}

  /**
   * Extend creates a new Container with the existing settings and applies new options.
   */
  public extend(options: ContainerOptions = {}): Container {
    return container(options, this);
  }

  /**
   * Name returns the fully-qualified container name.
   */
  public name(): string {
    return this.nameValue;
  }

  /**
   * ResolveCandidateNames returns namespaced identifier candidates in C++ resolution order.
   */
  public resolveCandidateNames(name: string): string[] {
    if (name.startsWith(".")) {
      const qualifiedName = name.slice(1);
      const [alias, isAlias] = this.findAlias(qualifiedName);
      return isAlias ? [alias] : [qualifiedName];
    }
    const [alias, isAlias] = this.findAlias(name);
    if (isAlias) {
      return [alias];
    }
    if (this.name() === "") {
      return [name];
    }
    let nextCont = this.name();
    const candidates = [`${nextCont}.${name}`];
    for (let idx = nextCont.lastIndexOf("."); idx >= 0; idx = nextCont.lastIndexOf(".")) {
      nextCont = nextCont.slice(0, idx);
      candidates.push(`${nextCont}.${name}`);
    }
    candidates.push(name);
    return candidates;
  }

  /**
   * AliasSet returns the alias to fully-qualified name mapping stored in the container.
   */
  public aliasSet(): Map<string, string> {
    return this.aliasesValue.size === 0 ? new Map(noAliases) : new Map(this.aliasesValue);
  }

  private findAlias(name: string): [string, boolean] {
    let simple = name;
    let qualifier = "";
    const dot = name.indexOf(".");
    if (dot >= 0) {
      simple = name.slice(0, dot);
      qualifier = name.slice(dot);
    }
    const alias = this.aliasesValue.get(simple);
    if (!alias) {
      return ["", false];
    }
    return [`${alias}${qualifier}`, true];
  }
}

/**
 * DefaultContainer has an empty container name.
 */
export const defaultContainer = new Container();

/**
 * ContainerAlias binds a qualified name to a simple alias.
 */
export type ContainerAlias = {
  qualifiedName: string;
  alias: string;
};

/**
 * ContainerOptions configures a Container.
 */
export type ContainerOptions = {
  name?: string;
  aliases?: ContainerAlias[];
  abbrevs?: string[];
};

/**
 * ContainerValue creates a new Container with the provided options.
 */
export function container(
  options: ContainerOptions = {},
  base: Container = defaultContainer,
): Container {
  const nameValue = options.name ?? base.name();
  validateContainerName(nameValue);

  const aliases = base.aliasSet();
  for (const entry of options.abbrevs ?? []) {
    const qualifiedName = entry.trim();
    validateQualifiedName(qualifiedName);
    const index = qualifiedName.lastIndexOf(".");
    if (index <= 0 || index >= qualifiedName.length - 1) {
      throw new globalThis.Error(
        `invalid qualified name: ${qualifiedName}, wanted name of the form 'qualified.name'`,
      );
    }
    setAlias(
      "abbreviation",
      aliases,
      nameValue,
      qualifiedName,
      qualifiedName.slice(index + 1),
      true,
    );
  }
  for (const entry of options.aliases ?? []) {
    setAlias("alias", aliases, nameValue, entry.qualifiedName, entry.alias, false);
  }
  return new Container(nameValue, aliases);
}

/**
 * ToQualifiedName converts an expression AST into a qualified name if possible.
 */
export function toQualifiedName(expr: Expr): [string, boolean] {
  switch (expr.kind()) {
    case ExprKind.Ident:
      return [expr.asIdent() ?? "", true];
    case ExprKind.Select: {
      const select = expr.asSelect();
      if (!select || select.isTestOnly()) {
        return ["", false];
      }
      const [qualifier, found] = toQualifiedName(select.operand());
      return found ? [`${qualifier}.${select.fieldName()}`, true] : ["", false];
    }
    default:
      return ["", false];
  }
}

function setAlias(
  kind: "alias" | "abbreviation",
  aliases: Map<string, string>,
  containerName: string,
  qualifiedName: string,
  aliasName: string,
  requireQualified: boolean,
): void {
  if (aliasName.length === 0 || aliasName.includes(".")) {
    throw new globalThis.Error(
      `${kind} must be non-empty and simple (not qualified): ${kind}=${aliasName}`,
    );
  }
  if (qualifiedName.length === 0) {
    throw new globalThis.Error(`${kind} must refer to a valid name: ${qualifiedName}`);
  }
  if (qualifiedName.startsWith(".")) {
    throw new globalThis.Error(
      `qualified name must not begin with a leading '.': ${qualifiedName}`,
    );
  }
  const index = qualifiedName.lastIndexOf(".");
  if (index === qualifiedName.length - 1 || (requireQualified && index <= 0)) {
    throw new globalThis.Error(`${kind} must refer to a valid qualified name: ${qualifiedName}`);
  }
  const aliasRef = aliases.get(aliasName);
  if (aliasRef) {
    throw new globalThis.Error(
      `${kind} collides with existing reference: name=${qualifiedName}, ${kind}=${aliasName}, existing=${aliasRef}`,
    );
  }
  if (containerName.startsWith(`${aliasName}.`) || containerName === aliasName) {
    throw new globalThis.Error(
      `${kind} collides with container name: name=${qualifiedName}, ${kind}=${aliasName}, container=${containerName}`,
    );
  }
  aliases.set(aliasName, qualifiedName);
}

function validateQualifiedName(qualifiedName: string): void {
  for (const rune of qualifiedName) {
    if (!isIdentifierChar(rune)) {
      throw new globalThis.Error(
        `invalid qualified name: ${qualifiedName}, wanted name of the form 'qualified.name'`,
      );
    }
  }
}

function validateContainerName(containerName: string): void {
  if (containerName.length > 0 && containerName.startsWith(".")) {
    throw new globalThis.Error(`container name must not contain a leading '.': ${containerName}`);
  }
}

function isIdentifierChar(char: string): boolean {
  return /^[A-Za-z0-9._]$/.test(char);
}
