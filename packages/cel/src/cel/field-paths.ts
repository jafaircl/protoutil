import { type Doc, fieldDoc } from "../common/doc.js";
import type { Provider } from "../common/types/provider.js";
import { Kind, type Type } from "../common/types/types.js";

/**
 * FieldPath represents a selection path to a field from a variable in a CEL environment.
 */
export class FieldPath {
  /**
   * Creates a field path discovered while traversing a CEL type.
   */
  public constructor(
    /** Type is the CEL type selected by the path. */
    public readonly type: Type,
    /** Path represents the selection path to the field. */
    public readonly path: string,
    /** Description contains provider-supplied documentation for the field. */
    public readonly description: string,
    /** IsLeaf indicates whether traversal stops at this path. */
    public isLeaf: boolean,
  ) {}

  /**
   * Documentation implements the Documentor interface.
   */
  public documentation(): Doc {
    return fieldDoc(this.path, this.type.toString(), this.description);
  }
}

/**
 * DocumentationProvider resolves documentation for fields when it is available.
 */
interface DocumentationProvider {
  /**
   * findStructFieldDescription returns documentation for a field if available.
   * It returns false if the field could not be found.
   */
  findStructFieldDescription(typeName: string, fieldName: string): [string, boolean];
}

/**
 * FieldPathTraversalOptions configures a field-path traversal.
 */
interface FieldPathTraversalOptions {
  /** Provider resolves the fields and types encountered by the traversal. */
  provider: Provider;
  /** Path contains the field steps visited along the current branch. */
  path: string[];
  /** Types contains the field types visited along the current branch to avoid cycles. */
  types: Type[];
}

/**
 * FieldPathExpansionOptions supplies one recursive traversal step.
 */
interface FieldPathExpansionOptions {
  /** Paths contains all field paths found so far. */
  paths: FieldPath[];
  /** Type is the CEL type expanded by this traversal step. */
  type: Type;
}

/**
 * FieldPathPushOptions supplies a path step and its associated CEL type.
 */
interface FieldPathPushOptions {
  /** PathStep is the next selector or index appended to the current path. */
  pathStep: string;
  /** Type is the CEL type associated with the path step. */
  type: Type;
}

/**
 * FieldPathsForTypeOptions configures reachable-field enumeration.
 */
export interface FieldPathsForTypeOptions {
  /** Provider resolves structure fields and their CEL types. */
  provider: Provider;
  /** Identifier is the root variable name used to begin every returned path. */
  identifier: string;
  /** Type is the CEL type associated with the root identifier. */
  type: Type;
}

/**
 * FieldPathTraversal tracks the current traversal branch while reachable fields are expanded.
 */
class FieldPathTraversal {
  /** Provider resolves types. */
  private readonly provider: Provider;

  /** Path contains the fields visited along the current branch. */
  private readonly path: string[];

  /** Types contains the field types visited along the current branch to avoid cycles. */
  private readonly types: Type[];

  /**
   * Creates traversal state for a root identifier and type.
   */
  public constructor(options: FieldPathTraversalOptions) {
    this.provider = options.provider;
    this.path = options.path;
    this.types = options.types;
  }

  /**
   * Expands all reachable fields from a CEL type.
   */
  public expand(options: FieldPathExpansionOptions): FieldPath[] {
    const { paths, type } = options;
    if (this.containsPriorType(type)) {
      // Cycle detected, so stop expanding.
      paths[paths.length - 1]!.isLeaf = false;
      return paths;
    }

    switch (type.kind()) {
      case Kind.Struct:
        return this.expandStruct({ paths, type });
      case Kind.Map:
        return this.expandMap({ paths, type });
      case Kind.List:
        return this.expandList({ paths, type });
      default:
        paths[paths.length - 1]!.isLeaf = true;
        return paths;
    }
  }

  /**
   * Adds a step to the current traversal branch.
   */
  private push(options: FieldPathPushOptions): void {
    this.path.push(options.pathStep);
    this.types.push(options.type);
  }

  /**
   * Removes the final step from the current traversal branch.
   */
  private pop(): void {
    this.path.pop();
    this.types.pop();
  }

  /**
   * Reports whether the current type occurred earlier in the active branch.
   */
  private containsPriorType(type: Type): boolean {
    const typeName = type.toString();
    for (let index = 0; index < this.types.length - 1; index += 1) {
      if (this.types[index]!.toString() === typeName) {
        return true;
      }
    }
    return false;
  }

  /**
   * Expands the fields exposed by a structure type.
   */
  private expandStruct(options: FieldPathExpansionOptions): FieldPath[] {
    const { paths, type } = options;
    const [fields, found] = this.provider.findStructFieldNames(type.toString());
    if (!found) {
      // The caller added this type to the path, so it must be a leaf.
      paths[paths.length - 1]!.isLeaf = true;
      return paths;
    }

    for (const field of fields) {
      const [fieldType, fieldFound] = this.provider.findStructFieldType(type.toString(), field);
      if (!fieldFound || fieldType === undefined) {
        // The field was not found because it is hidden or invalid.
        continue;
      }

      this.push({ pathStep: field, type });
      const path = new FieldPath(
        fieldType.type,
        formatPath({ path: this.path }),
        this.fieldDescription({ field, typeName: type.toString() }),
        false,
      );
      paths.push(path);
      this.expand({ paths, type: fieldType.type });
      this.pop();
    }
    return paths;
  }

  /**
   * Expands the value selected by a representative map key.
   */
  private expandMap(options: FieldPathExpansionOptions): FieldPath[] {
    const { paths, type } = options;
    if (type.parameters().length !== 2) {
      // Treat a dynamic map as a leaf.
      paths[paths.length - 1]!.isLeaf = true;
      return paths;
    }

    const [mapKeyType, mapValueType] = type.parameters() as [Type, Type];
    const keyIdentifier = mapKeyPlaceholder(mapKeyType);
    if (keyIdentifier === undefined) {
      // The caller added this type to the path, so it must be a leaf.
      paths[paths.length - 1]!.isLeaf = true;
      return paths;
    }

    this.push({ pathStep: keyIdentifier, type: mapValueType });
    this.expand({ paths, type: mapValueType });
    this.pop();
    return paths;
  }

  /**
   * Expands the element selected by a representative list index.
   */
  private expandList(options: FieldPathExpansionOptions): FieldPath[] {
    const { paths, type } = options;
    if (type.parameters().length !== 1) {
      // Treat a dynamic list as a leaf.
      paths[paths.length - 1]!.isLeaf = true;
      return paths;
    }

    const listElementType = type.parameters()[0]!;
    this.push({ pathStep: "[0]", type: listElementType });
    this.expand({ paths, type: listElementType });
    this.pop();
    return paths;
  }

  /**
   * Returns provider-supplied field documentation when supported.
   */
  private fieldDescription(options: {
    /** Field is the structure field whose documentation is requested. */
    field: string;
    /** TypeName is the structure containing the field. */
    typeName: string;
  }): string {
    if (!isDocumentationProvider(this.provider)) {
      return "";
    }
    const [description] = this.provider.findStructFieldDescription(options.typeName, options.field);
    return description;
  }
}

/**
 * FormatPathOptions provides path steps to render as a CEL selection path.
 */
interface FormatPathOptions {
  /** Path is the ordered collection of identifier, field, and index steps. */
  path: string[];
}

/**
 * Formats identifier, field, and index steps as a CEL selection path.
 */
function formatPath(options: FormatPathOptions): string {
  let result = "";
  for (const [index, step] of options.path.entries()) {
    if (index === 0 || step.startsWith("[")) {
      result += step;
    } else {
      result += `.${step}`;
    }
  }
  return result;
}

/**
 * Returns the CEL zero-value selector for a supported map key type.
 */
function mapKeyPlaceholder(type: Type): string | undefined {
  switch (type.kind()) {
    case Kind.String:
      return '[""]';
    case Kind.Int:
      return "[0]";
    case Kind.Uint:
      return "[0u]";
    case Kind.Bool:
      return "[false]";
    default:
      return undefined;
  }
}

/**
 * Reports whether a provider can resolve structure field descriptions.
 */
function isDocumentationProvider(provider: Provider): provider is Provider & DocumentationProvider {
  return (
    "findStructFieldDescription" in provider &&
    typeof provider.findStructFieldDescription === "function"
  );
}

/**
 * fieldPathsForType expands the reachable fields from the given root identifier.
 */
export function fieldPathsForType(options: FieldPathsForTypeOptions): FieldPath[] {
  const traversal = new FieldPathTraversal({
    provider: options.provider,
    path: [options.identifier],
    types: [options.type],
  });
  const paths = [new FieldPath(options.type, options.identifier, "", false)];
  return traversal.expand({ paths, type: options.type });
}
