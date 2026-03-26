import type { DescMessage } from "@bufbuild/protobuf";
import type { Decl } from "../gen/google/api/expr/v1alpha1/checked_pb.js";
import { descFieldToType, ident } from "./types.js";

/**
 * Generate filter type declarations from a protobuf message descriptor.
 * Each field on the message becomes a top-level ident declaration, allowing
 * filter expressions to reference fields directly without a prefix.
 *
 * @example
 * ```typescript
 * import { TimestampSchema } from "@bufbuild/protobuf/wkt";
 *
 * const decls = contextDecls(TimestampSchema);
 * // → [ident("seconds", INT64), ident("nanos", INT64)]
 *
 * const { checkedExpr } = check(parsed, { decls });
 * // filter: "seconds < 4 AND nanos > 50"
 * ```
 */
export function contextDecls(desc: DescMessage): Decl[] {
  return desc.fields.map((field) => ident(field.name, descFieldToType(field)));
}
