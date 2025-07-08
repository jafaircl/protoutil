export {
  AstNode,
  CallEstimate,
  CostEstimate,
  Coster,
  SizeEstimate,
  addUint64NoOverflow,
  constCost,
  createListBaseCost,
  createMapBaseCost,
  createMessageBaseCost,
  isScalar,
  multiplyByCostFactor,
  multiplyUint64NoOverflow,
  overloadCostEstimate,
  presenceTestHasCost,
  selectAndIdentCost,
  variableCostEstimate,
} from '../checker/cost.js';
export type { CostEstimator, CostOption, VariableCostFn } from '../checker/cost.js';
export {
  isAssignable,
  isAssignableList,
  isDyn,
  isDynOrError,
  isEqualOrLessSpecific,
  isError,
  isOptional,
  isValidTypeSubstitution,
  maybeUnwrapOptional,
} from '../checker/types.js';
export { ReferenceInfo, SourceInfo } from '../common/ast/ast.js';
export {
  NavigableExpr,
  postOrderVisit,
  postOrderVisitNavigable,
  preOrderVisit,
  preOrderVisitNavigable,
  visit,
  visitNavigable,
} from '../common/ast/navigable.js';
export type {
  ExprMatcher,
  NavigableExprMatcher,
  NavigableExprVisitor,
  Visitor,
} from '../common/ast/navigable.js';
export {
  ConstCost,
  ListCreateBaseCost,
  MapCreateBaseCost,
  RegexStringLengthCostFactor,
  SelectAndIdentCost,
  StringTraversalCostFactor,
  StructCreateBaseCost,
} from '../common/cost.js';
export {
  FunctionDecl,
  OverloadDecl,
  VariableDecl,
  newConstantDecl as constantDecl,
  newFunction as functionDecl,
  binaryBinding as overloadBinaryBinding,
  functionBinding as overloadFunctionBinding,
  unaryBinding as overloadUnaryBinding,
  newVariableDecl as variableDecl,
} from '../common/decls.js';
export { CELError } from '../common/error.js';
export { Location, NoLocation } from '../common/location.js';
export {
  isBoolProtoConstant,
  isBytesProtoConstant,
  isDoubleProtoConstant,
  isIntProtoConstant,
  isNullProtoConstant,
  isStringProtoConstant,
  isUintProtoConstant,
  protoConstantToRefVal,
  protoConstantToType,
  refValToProtoConstant,
} from '../common/pb/constants.js';
export { isConstIdentDeclProto, isVarIdentDeclProto } from '../common/pb/decls.js';
export {
  isBoolProtoExpr,
  isBytesProtoExpr,
  isCallProtoExpr,
  isComprehensionProtoExpr,
  isConstantProtoExpr,
  isDoubleProtoExpr,
  isGlobalCallProtoExpr,
  isIdentProtoExpr,
  isIntProtoExpr,
  isListProtoExpr,
  isMapEntryProtoExpr,
  isMapProtoExpr,
  isMessageFieldProtoExpr,
  isMessageProtoExpr,
  isNullProtoExpr,
  isReceiverCallProtoExpr,
  isSelectProtoExpr,
  isStringProtoExpr,
  isStructProtoExpr,
  isTestOnlySelectProtoExpr,
  isUintProtoExpr,
  unwrapBoolProtoExpr,
  unwrapBytesProtoExpr,
  unwrapCallProtoExpr,
  unwrapComprehensionProtoExpr,
  unwrapConstantProtoExpr,
  unwrapDoubleProtoExpr,
  unwrapGlobalCallProtoExpr,
  unwrapIdentProtoExpr,
  unwrapIntProtoExpr,
  unwrapListProtoExpr,
  unwrapMapEntryProtoExpr,
  unwrapMapProtoExpr,
  unwrapMessageFieldProtoExpr,
  unwrapMessageProtoExpr,
  unwrapNullProtoExpr,
  unwrapReceiverCallProtoExpr,
  unwrapSelectProtoExpr,
  unwrapStringProtoExpr,
  unwrapStructProtoExpr,
  unwrapTestOnlySelectProtoExpr,
  unwrapUintProtoExpr,
} from '../common/pb/expressions.js';
export {
  isAnyProtoType,
  isBoolProtoType,
  isBytesProtoType,
  isDoubleProtoType,
  isDurationProtoType,
  isDynOrErrorProtoType,
  isDynProtoType,
  isErrorProtoType,
  isFunctionProtoType,
  isIntProtoType,
  isNullProtoType,
  isStringProtoType,
  isTimestampProtoType,
  isUintProtoType,
} from '../common/pb/types.js';
export {
  isBoolProtoValue,
  isBytesProtoValue,
  isDoubleProtoValue,
  isIntProtoValue,
  isNullProtoValue,
  isStringProtoValue,
  isUintProtoValue,
} from '../common/pb/values.js';
export { isAdapter, isFieldType, isProvider, isRegistry } from '../common/ref/provider.js';
export type { Registry } from '../common/ref/provider.js';
export { isRefType, isRefVal } from '../common/ref/reference.js';
export type { RefType, RefVal } from '../common/ref/reference.js';
export { BoolRefVal as BoolVal, isBoolRefVal } from '../common/types/bool.js';
export { BytesRefVal as BytesVal } from '../common/types/bytes.js';
export { DoubleRefVal as DoubleVal } from '../common/types/double.js';
export { DurationRefVal as DurationVal } from '../common/types/duration.js';
export { isErrorRefVal } from '../common/types/error.js';
export { IntRefVal as IntVal, isValidInt32, isValidInt64 } from '../common/types/int.js';
export { RefValList as ListVal } from '../common/types/list.js';
export { RefValMap as MapVal } from '../common/types/map.js';
export { NullRefVal as NullVal, isNullRefVal } from '../common/types/null.js';
export { isNumberProtoValue, isNumberRefVal } from '../common/types/number.js';
export { ObjectRefVal as ObjectVal, isMessageZeroValue } from '../common/types/object.js';
export { OptionalRefVal as OptionalVal, isOptionalRefVal } from '../common/types/optional.js';
export { fieldDescToCELType } from '../common/types/provider.js';
export { StringRefVal as StringVal, isStringRefVal } from '../common/types/string.js';
export { TimestampRefVal as TimestampVal } from '../common/types/timestamp.js';
export { isComparer } from '../common/types/traits/comparer.js';
export { isContainer } from '../common/types/traits/container.js';
export { isFieldTester } from '../common/types/traits/field-tester.js';
export { isIndexer } from '../common/types/traits/indexer.js';
export { isFoldable, isFolder, isIterable, isIterator } from '../common/types/traits/iterator.js';
export { isLister, isMutableLister } from '../common/types/traits/lister.js';
export { isMapper, isMutableMapper } from '../common/types/traits/mapper.js';
export { isMatcher } from '../common/types/traits/matcher.js';
export {
  isAdder,
  isDivider,
  isModder,
  isMultiplier,
  isNegater,
  isSubtractor,
} from '../common/types/traits/math.js';
export { isReceiver } from '../common/types/traits/receiver.js';
export { isSizer } from '../common/types/traits/sizer.js';
export { isZeroer } from '../common/types/traits/zeroer.js';
export { isType, isWellKnownType, maybeForeignType } from '../common/types/types.js';
export { UintRefVal as UintVal, isValidUint32, isValidUint64 } from '../common/types/uint.js';
export {
  UnknownRefVal as UnknownVal,
  isIdentifierCharater,
  isUnknownRefVal,
} from '../common/types/unknown.js';
export { isUnknownOrError } from '../common/types/utils.js';
export { isWrapperType } from '../common/types/wrapper.js';
export { isHexString, isOctalString, isScientificNotationString } from '../common/utils.js';
export { AttributePattern, isQualifierValueEquator } from '../interpreter/attribute-patterns.js';
export {
  isAttribute,
  isAttributeFactory,
  isConditionalAttribute,
  isConstantQualifier,
  isNamespacedAttribute,
  isQualifier,
} from '../interpreter/attributes.js';
export {
  isInterpretable,
  isInterpretableAttribute,
  isInterpretableCall,
  isInterpretableConst,
  isInterpretableConstructor,
} from '../interpreter/interpretable.js';
export type { ParserOption } from '../parser/parser.js';
export {
  unparse,
  wrapAfterColumnLimit,
  wrapOnColumn,
  wrapOnOperators,
} from '../parser/unparser.js';
export type { UnparserOption } from '../parser/unparser.js';
export type { ExprHelper } from './../parser/helper.js';
export {
  AccumulatorName,
  AllMacro,
  AllMacros,
  ExistsMacro,
  ExistsOneMacroNew as ExistsOneMacro,
  FilterMacro,
  GlobalMacro,
  GlobalVarArgMacro,
  HasMacro,
  MapFilterMacro,
  MapMacro,
  QuantifierKind,
  ReceiverMacro,
  ReceiverVarArgMacro,
  makeMacroKey,
  makeVarArgMacroKey,
} from './../parser/macro.js';
export type { Macro, MacroExpander } from './../parser/macro.js';
export {
  AnyType,
  BoolType,
  BytesType,
  DoubleType,
  DurationType,
  DynType,
  IntType,
  Kind,
  ListType,
  MapType,
  NullType,
  StringType,
  TimestampType,
  Type,
  TypeType,
  UintType,
  constant,
  disableDeclaration,
  exprDeclToDeclaration,
  exprTypeToType,
  func,
  listType,
  mapType,
  maybeUnwrapDeclaration,
  memberOverload,
  nullableType,
  objectType,
  opaqueType,
  optionalType,
  overload,
  protoDeclToDecl,
  singletonBinaryBinding,
  singletonFunctionBinding,
  singletonUnaryBinding,
  typeParamType,
  typeToExprType,
  variable,
} from './decls.js';
export type { Declaration } from './decls.js';
export { Ast, CustomEnv, Env, Issues, formatCELType } from './env.js';
export type { Source } from './env.js';
export { ConstantFoldingOptimizer, foldKnownValues, maxConstantFoldIterations } from './folding.js';
export type { ConstantFoldingOption } from './folding.js';
export { InlineVariable, InliningOptimizer } from './inlining.js';
export {
  astToCheckedExpr,
  astToParsedExpr,
  astToString,
  checkedExprToAst,
  checkedExprToAstWithSource,
  exprToString,
  parsedExprToAst,
  parsedExprToAstWithSource,
} from './io.js';
export { Feature, StdLib, isLibrary, isSingletonLibrary, lib } from './library.js';
export type { Library, SingletonLibrary } from './library.js';
export { OptimizerContext, StaticOptimizer } from './optimizer.js';
export type { ASTOptimizer } from './optimizer.js';
export {
  EvalOption,
  abbrevs,
  clearMacros,
  container,
  contextProtoVars,
  costEstimatorOptions,
  crossTypeNumericComparisons,
  customDecorator,
  customTypeAdapter,
  customTypeProvider,
  declarations,
  declareContextProto,
  defaultUTCTimeZone,
  eagerlyValidateDeclarations,
  enableIdentifierEscapeSyntax,
  enableMacroCallTracking,
  enableOptionalSyntax,
  evalOptions,
  globals,
  homogeneousAggregateLiterals,
  macros,
  types,
  variadicLogicalOperatorASTs,
} from './options.js';
export type { EnvOption, ProgramOption } from './options.js';
export { EvalDetails, attributePattern, newActivation, noVars, partialVars } from './program.js';
export type { Activation, AttributePatternType, PartialActivation, Program } from './program.js';
export { normalizeMessageKeys } from './utils.js';
