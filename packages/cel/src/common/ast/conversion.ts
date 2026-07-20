export {
  type Extension,
  ExtensionComponent,
  type ExtensionVersion,
  exprToProto,
  extension,
  extensionVersion,
  type OffsetRange,
  protoToReferenceInfo,
  protoToSourceInfo,
  referenceInfoToProto,
  sourceInfoToProto,
  toAst,
  toProto,
} from "./ast.js";
export {
  constantToVal,
  entryExprToProto,
  protoConstantToValue,
  protoToEntryExpr,
  protoToExpr,
  valToConstant,
} from "./expr.js";
