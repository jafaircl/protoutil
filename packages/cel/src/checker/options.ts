import type { Env } from "./env.js";
import type { Scopes } from "./scopes.js";

/**
 * CheckerOptions mirrors the configuration carried by cel-go's checker env options.
 */
export interface CheckerOptions {
  crossTypeNumericComparisons?: boolean;
  homogeneousAggregateLiterals?: boolean;
  validatedDeclarations?: Scopes;
  jsonFieldNames?: boolean;
}

/**
 * validatedDeclarations returns the already-validated declaration scope stack for reuse.
 */
export function validatedDeclarations(env: Env): Scopes {
  return env.validatedDeclarations();
}
