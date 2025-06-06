import { isNil } from './utils.js';

/**
 * Holds a reference to an optional qualified container name and set of aliases.
 *
 * The program container can be used to simplify variable, function, and type
 * specification within CEL programs and behaves more or less like a C++
 * namespace. See resolveCandidateNames for more details.
 */
export class Container {
  public name = '';
  public aliases = new Map<string, string>();

  constructor(...options: ContainerOption[]) {
    for (const option of options) {
      option(this);
    }
  }

  /**
   * Extend creates a new Container with the existing settings and applies a
   * series of ContainerOptions to further configure the new container.
   */
  extend(...opts: ContainerOption[]): Container {
    // Copy the name and aliases of the existing container.
    let ext = new Container(name(this.name));
    if (this.aliasSet().size > 0) {
      const aliasSet = new Map<string, string>();
      for (const [k, v] of this.aliasSet()) {
        aliasSet.set(k, v);
      }
      ext.aliases = aliasSet;
    }
    // Apply the new options to the container.
    for (const opt of opts) {
      ext = opt(ext);
    }
    return ext;
  }

  /**
   * Returns the candidates name of namespaced identifiers in C++ resolution
   * order.
   *
   * Names which shadow other names are returned first. If a name includes
   * leading dot ('.'), the name is treated as an absolute identifier which
   * cannot be shadowed.
   *
   * Given a container name a.b.c.M.N and a type name R.s, this will deliver in
   * order:
   *
   * a.b.c.M.N.R.s
   * a.b.c.M.R.s
   * a.b.c.R.s
   * a.b.R.s
   * a.R.s
   * R.s
   *
   * If aliases or abbreviations are configured for the container, then alias
   * names will take precedence over containerized names.
   *
   * @param name the candidate name to resolve
   */
  resolveCandidateNames(name: string): string[] {
    if (name.startsWith('.')) {
      const qn = name.substring(1);
      const alias = this.findAlias(qn);
      if (!isNil(alias) && alias !== '') {
        return [alias];
      }
      return [qn];
    }
    const alias = this.findAlias(name);
    if (!isNil(alias) && alias !== '') {
      return [alias];
    }
    if (this.name === '') {
      return [name];
    }
    let nextCont = this.name;
    const candidates = [`${nextCont}.${name}`];
    for (let i = nextCont.lastIndexOf('.'); i > -1; i = nextCont.lastIndexOf('.')) {
      nextCont = nextCont.substring(0, i);
      candidates.push(`${nextCont}.${name}`);
    }
    return [...candidates, name];
  }

  /**
   * aliasSet returns the alias to fully-qualified name mapping stored in the
   * container.
   */
  aliasSet() {
    return this.aliases;
  }

  /**
   * Takes a name as input and returns an alias expansion if one exists.
   *
   * If the name is qualified, the first component of the qualified name is
   * checked against known aliases. Any alias that is found in a qualified name
   * is expanded in the result:
   *
   * alias: R -> my.alias.R
   * name: R.S.T
   * output: my.alias.R.S.T
   *
   * Note, the name must not have a leading dot.
   *
   * @param name the name to find an alias for
   * @returns the alias if one exists, otherwise an empty string
   */
  findAlias(name: string) {
    // If an alias exists for the name, ensure it is searched last.
    let simple = name;
    let qualifier = '';
    const dot = name.indexOf('.');
    if (dot > -1) {
      simple = name.substring(0, dot);
      qualifier = name.substring(dot);
    }
    const alias = this.aliases.get(simple);
    if (isNil(alias)) {
      return '';
    }
    return alias + qualifier;
  }
}

/**
 * ContainerOption specifies a functional configuration option for a Container.
 *
 * Note, ContainerOption implementations must be able to handle nil container
 * inputs.
 */
export type ContainerOption = (container: Container) => Container;

/**
 * Abbrevs configures a set of simple names as abbreviations for
 * fully-qualified names.
 *
 * An abbreviation (abbrev for short) is a simple name that expands to a
 * fully-qualified name. Abbreviations can be useful when working with
 * variables, functions, and especially types from multiple namespaces:
 *
 * ```ts
 * // CEL object construction
 * qual.pkg.version.ObjTypeName{
 *    field: alt.container.ver.FieldTypeName{value: ...}
 * }
 * ```
 *
 * Only one the qualified names above may be used as the CEL container, so at
 * least one of these references must be a long qualified name within an
 * otherwise short CEL program. Using the following abbreviations, the
 * program becomes much simpler:
 *
 * ```ts
 * // CEL Go option
 * Abbrevs("qual.pkg.version.ObjTypeName", "alt.container.ver.FieldTypeName")
 * // Simplified Object construction
 * ObjTypeName{field: FieldTypeName{value: ...}}
 * ```
 *
 * There are a few rules for the qualified names and the simple abbreviations
 * generated from them:
 * - Qualified names must be dot-delimited, e.g. `package.subpkg.name`.
 * - The last element in the qualified name is the abbreviation.
 * - Abbreviations must not collide with each other.
 * - The abbreviation must not collide with unqualified names in use.
 *
 * Abbreviations are distinct from container-based references in the
 * following important ways:
 * - Abbreviations must expand to a fully-qualified name.
 * - Expanded abbreviations do not participate in namespace resolution.
 * - Abbreviation expansion is done instead of the container search for a
 * matching identifier.
 * - Containers follow C++ namespace resolution rules with searches from the
 * most qualified name to the least qualified name.
 * - Container references within the CEL program may be relative, and are
 * resolved to fully qualified names at either type-check time or program
 * plan time, whichever comes first.
 *
 * If there is ever a case where an identifier could be in both the container
 * and as an abbreviation, the abbreviation wins as this will ensure that the
 * meaning of a program is preserved between compilations even as the
 * container evolves.
 */
export function abbrevs(...qualifiedNames: string[]): ContainerOption {
  return (c) => {
    for (const qualifiedName of qualifiedNames) {
      const qn = qualifiedName.trim();
      for (const rune of qn) {
        if (!/[a-zA-Z0-9_.]/.test(rune)) {
          throw new Error(
            `invalid qualified name: ${qn}, wanted name of the form 'qualified.name'`
          );
        }
      }
      const ind = qn.lastIndexOf('.');
      if (ind <= 0 || ind >= qn.length - 1) {
        throw new Error(`invalid qualified name: ${qn}, wanted name of the form 'qualified.name'`);
      }
      const alias = qn.substring(ind + 1);
      c = aliasAs('abbreviation', qn, alias)(c);
    }
    return c;
  };
}

/**
 * Alias associates a fully-qualified name with a user-defined alias.
 *
 * In general, Abbrevs is preferred to Alias since the names generated from
 * the Abbrevs option are more easily traced back to source code. The Alias
 * option is useful for propagating alias configuration from one Container
 * instance to another, and may also be useful for remapping poorly chosen
 * protobuf message / package names.
 *
 * Note: all of the rules that apply to Abbrevs also apply to Alias.
 */
export function alias(qualifiedName: string, alias: string): ContainerOption {
  return aliasAs('alias', qualifiedName, alias);
}

function aliasAs(kind: string, qualifiedName: string, alias: string): ContainerOption {
  return (c) => {
    if (alias.length === 0 || alias.indexOf('.') > -1) {
      throw new Error(`${kind} must be non-empty and simple (not qualified): ${kind}=${alias}`);
    }
    if (qualifiedName[0] === '.') {
      throw new Error(`qualified name must not begin with a leading '.': ${qualifiedName}`);
    }
    const ind = qualifiedName.lastIndexOf('.');
    if (ind <= 0 || ind === qualifiedName.length - 1) {
      throw new Error(`${kind} must refer to a valid qualified name: ${qualifiedName}`);
    }
    const aliasRef = c.aliasSet().get(alias);
    if (!isNil(aliasRef) && aliasRef !== '') {
      throw new Error(
        `${kind} collides with existing reference: name=${qualifiedName}, ${kind}=${alias}, existing=${aliasRef}`
      );
    }
    if (c.name.startsWith(alias + '.') || c.name === alias) {
      throw new Error(
        `${kind} collides with container name: name=${qualifiedName}, ${kind}=${alias}, container=${c.name}`
      );
    }
    c.aliases.set(alias, qualifiedName);
    return c;
  };
}

/**
 * Name sets the fully-qualified name of the Container.
 */
export function name(name: string): ContainerOption {
  return (c) => {
    if (name.length > 0 && name[0] === '.') {
      throw new Error(`container name must not contain a leading '.': ${name}`);
    }
    if (c.name === name) {
      return c;
    }
    c.name = name;
    return c;
  };
}
