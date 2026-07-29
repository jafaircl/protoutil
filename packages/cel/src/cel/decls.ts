import { constantToVal } from "../common/ast/expr.js";
import {
  constantDecl,
  type FunctionDecl,
  functionDecl,
  memberOverload,
  type OverloadDecl,
  overload,
  type VariableDecl,
  variableDeclWithDoc,
} from "../common/decls.js";
import { DefaultTypeAdapter } from "../common/types/provider.js";
import { exprTypeToType } from "../common/types/types.js";
import type { Decl, Decl_FunctionDecl_Overload } from "../gen/cel/expr/checked_pb.js";

/**
 * Declaration is a CEL-native variable or function declaration.
 */
export type Declaration = VariableDecl | FunctionDecl;

/**
 * OverloadFromProtoOptions configures conversion of a protobuf function overload.
 */
interface OverloadFromProtoOptions {
  /** Overload is the canonical protobuf declaration to convert. */
  overload: Decl_FunctionDecl_Overload;
}

/**
 * declarationFromProto converts a canonical cel.expr.Decl value describing a variable or function
 * into a CEL-native declaration.
 */
export function declarationFromProto(declaration: Decl): Declaration {
  switch (declaration.declKind.case) {
    case "function":
      return functionDecl(declaration.name, {
        doc: declaration.declKind.value.doc,
        overloads: declaration.declKind.value.overloads.map((overloadValue) =>
          overloadFromProto({ overload: overloadValue }),
        ),
      });
    case "ident": {
      const identifier = declaration.declKind.value;
      if (identifier.type === undefined) {
        throw new Error(`unsupported type: ${JSON.stringify(identifier.type)}`);
      }
      const type = exprTypeToType(identifier.type);
      if (identifier.value === undefined) {
        return variableDeclWithDoc(declaration.name, type, identifier.doc);
      }
      return constantDecl(
        declaration.name,
        type,
        DefaultTypeAdapter.nativeToValue(constantToVal(identifier.value)),
      );
    }
    default:
      throw new Error(`unsupported decl: ${JSON.stringify(declaration)}`);
  }
}

/**
 * Converts a canonical protobuf function overload to its CEL-native declaration.
 */
function overloadFromProto(options: OverloadFromProtoOptions): OverloadDecl {
  const { overload: overloadValue } = options;
  const argumentTypes = overloadValue.params.map((parameter) => exprTypeToType(parameter));
  if (overloadValue.resultType === undefined) {
    throw new Error(`unsupported type: ${JSON.stringify(overloadValue.resultType)}`);
  }
  const resultType = exprTypeToType(overloadValue.resultType);
  const overloadOptions = {
    doc: overloadValue.doc,
  };
  return overloadValue.isInstanceFunction
    ? memberOverload(overloadValue.overloadId, argumentTypes, resultType, overloadOptions)
    : overload(overloadValue.overloadId, argumentTypes, resultType, overloadOptions);
}
