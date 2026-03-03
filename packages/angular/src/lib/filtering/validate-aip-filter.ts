import {
  type PathKind,
  type SchemaPath,
  type SchemaPathRules,
  validate,
} from "@angular/forms/signals";
import {
  check,
  type Decl,
  type Expr,
  outputType,
  parse,
  SemanticAdorner,
  toDebugString,
  typeToString,
} from "@protoutil/aip/filtering";

/**
 * Validates an AIP filter string in an Angular form control. This function uses the
 * parseAndCheckFilter function from the @protoutil/aip package to validate the filter string
 * and returns a validation error if the filter string is invalid. The validation error
 * can then be used to display an error message in the Angular form control.
 *
 * @param path the schema path of the form control to validate
 * @param declarations the optional filter declarations to use for validation
 */
export function validateAipFilter<TPathKind extends PathKind = PathKind.Root>(
  path: SchemaPath<string, SchemaPathRules.Supported, TPathKind>,
  declarations?: () => Decl[],
): void {
  validate(path, (ctx) => {
    const filter = ctx.value();
    if (!filter) return;
    try {
      const { checkedExpr, errors } = check(parse(filter), declarations ? declarations() : []);
      if (errors.length > 0) {
        return {
          kind: "invalidFilter",
          message: toDebugString(checkedExpr.expr as Expr, new SemanticAdorner(checkedExpr)),
        };
      }
      const type = outputType(checkedExpr);
      const typeString = type ? typeToString(type) : "unknown";
      if (typeString !== "bool") {
        return {
          kind: "invalidFilter",
          message: `Filter expression must evaluate to a boolean, but got ${typeString}`,
        };
      }
      return null;
    } catch (e) {
      return {
        kind: "invalidFilter",
        message: (e as Error).message,
      };
    }
  });
}
