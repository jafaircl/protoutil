import type { FunctionDecl, VariableDecl } from "../common/decls.js";

/**
 * Group holds the identifier and function declarations for one scope frame.
 */
export class Group {
  public readonly idents = new Map<string, VariableDecl>();
  public readonly functions = new Map<string, FunctionDecl>();

  /**
   * copy clones the current scope frame.
   */
  public copy(): Group {
    const next = group();
    for (const [name, ident] of this.idents) {
      next.idents.set(name, ident);
    }
    for (const [name, fn] of this.functions) {
      next.functions.set(name, fn);
    }
    return next;
  }
}

/**
 * group creates an empty scope frame.
 */
export function group(): Group {
  return new Group();
}

/**
 * Scopes models the nested declaration stack used by the checker.
 */
export class Scopes {
  constructor(
    public readonly parent?: Scopes,
    public readonly scopes: Group = group(),
  ) {}

  /**
   * copy clones the full scope chain.
   */
  public copy(): Scopes {
    return new Scopes(this.parent?.copy(), this.scopes.copy());
  }

  /**
   * push creates a new innermost scope frame.
   */
  public push(): Scopes {
    return new Scopes(this, group());
  }

  /**
   * pop returns the parent scope when present.
   */
  public pop(): Scopes {
    return this.parent ?? this;
  }

  /**
   * addIdent stores an identifier in the current frame.
   */
  public addIdent(decl: VariableDecl): void {
    this.scopes.idents.set(stripLeadingDot(decl.name()), decl);
  }

  /**
   * findIdent resolves an identifier from inner to outer scope.
   */
  public findIdent(name: string): VariableDecl | undefined {
    const key = stripLeadingDot(name);
    const ident = this.scopes.idents.get(key);
    if (ident) {
      return ident;
    }
    return this.parent?.findIdent(key);
  }

  /**
   * findIdentInScope resolves an identifier only in the current frame.
   */
  public findIdentInScope(name: string): VariableDecl | undefined {
    return this.scopes.idents.get(stripLeadingDot(name));
  }

  /**
   * findLocalIdent resolves an identifier while ignoring the root frame.
   */
  public findLocalIdent(name: string): VariableDecl | undefined {
    if (!this.parent) {
      return undefined;
    }
    return this.findIdentInScope(name) ?? this.parent.findLocalIdent(name);
  }

  /**
   * findGlobalIdent resolves an identifier from the root frame only.
   */
  public findGlobalIdent(name: string): VariableDecl | undefined {
    let scope: Scopes = this;
    while (scope.parent) {
      scope = scope.parent;
    }
    return scope.findIdentInScope(name);
  }

  /**
   * setFunction stores a function in the current frame.
   */
  public setFunction(fn: FunctionDecl): void {
    this.scopes.functions.set(stripLeadingDot(fn.name()), fn);
  }

  /**
   * findFunction resolves a function from inner to outer scope.
   */
  public findFunction(name: string): FunctionDecl | undefined {
    const key = stripLeadingDot(name);
    const fn = this.scopes.functions.get(key);
    if (fn) {
      return fn;
    }
    return this.parent?.findFunction(key);
  }
}

/**
 * scopes creates the root declaration stack.
 */
export function scopes(): Scopes {
  return new Scopes(undefined, group());
}

function stripLeadingDot(name: string): string {
  return name.startsWith(".") ? name.slice(1) : name;
}
