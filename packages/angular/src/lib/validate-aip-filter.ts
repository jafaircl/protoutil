import { type SchemaPath, validate } from "@angular/forms/signals";
import { type Declarations, parseAndCheckFilter } from "@protoutil/aip";

/**
 * Validates an AIP filter string in an Angular form control. This function uses the
 * parseAndCheckFilter function from the @protoutil/aip package to validate the filter string
 * and returns a validation error if the filter string is invalid. The validation error
 * can then be used to display an error message in the Angular form control.
 *
 * @param path the schema path of the form control to validate
 * @param declarations the optional filter declarations to use for validation
 */
export function validateAipFilter(path: SchemaPath<string>, declarations?: Declarations): void {
  validate(path, (ctx) => {
    const filter = ctx.value();
    if (!filter) return;
    try {
      parseAndCheckFilter(filter, declarations);
      return null;
    } catch (e) {
      return {
        kind: "invalidFilter",
        message: (e as Error).message,
      };
    }
  });
}
