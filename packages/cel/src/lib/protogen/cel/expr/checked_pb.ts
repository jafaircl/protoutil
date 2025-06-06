// Copyright 2024-2025 Buf Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @generated by protoc-gen-es v2.5.1 with parameter "target=ts,import_extension=.js,ts_nocheck=false"
// @generated from file cel/expr/checked.proto (package cel.expr, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv2";
import { enumDesc, fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv2";
import type { Constant, Expr, SourceInfo } from "./syntax_pb.js";
import { file_cel_expr_syntax } from "./syntax_pb.js";
import type { Empty, NullValue } from "@bufbuild/protobuf/wkt";
import { file_google_protobuf_empty, file_google_protobuf_struct } from "@bufbuild/protobuf/wkt";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file cel/expr/checked.proto.
 */
export const file_cel_expr_checked: GenFile = /*@__PURE__*/
  fileDesc("ChZjZWwvZXhwci9jaGVja2VkLnByb3RvEghjZWwuZXhwciLsAgoLQ2hlY2tlZEV4cHISPgoNcmVmZXJlbmNlX21hcBgCIAMoCzInLmNlbC5leHByLkNoZWNrZWRFeHByLlJlZmVyZW5jZU1hcEVudHJ5EjQKCHR5cGVfbWFwGAMgAygLMiIuY2VsLmV4cHIuQ2hlY2tlZEV4cHIuVHlwZU1hcEVudHJ5EikKC3NvdXJjZV9pbmZvGAUgASgLMhQuY2VsLmV4cHIuU291cmNlSW5mbxIUCgxleHByX3ZlcnNpb24YBiABKAkSHAoEZXhwchgEIAEoCzIOLmNlbC5leHByLkV4cHIaSAoRUmVmZXJlbmNlTWFwRW50cnkSCwoDa2V5GAEgASgDEiIKBXZhbHVlGAIgASgLMhMuY2VsLmV4cHIuUmVmZXJlbmNlOgI4ARo+CgxUeXBlTWFwRW50cnkSCwoDa2V5GAEgASgDEh0KBXZhbHVlGAIgASgLMg4uY2VsLmV4cHIuVHlwZToCOAEioggKBFR5cGUSJQoDZHluGAEgASgLMhYuZ29vZ2xlLnByb3RvYnVmLkVtcHR5SAASKgoEbnVsbBgCIAEoDjIaLmdvb2dsZS5wcm90b2J1Zi5OdWxsVmFsdWVIABIxCglwcmltaXRpdmUYAyABKA4yHC5jZWwuZXhwci5UeXBlLlByaW1pdGl2ZVR5cGVIABIvCgd3cmFwcGVyGAQgASgOMhwuY2VsLmV4cHIuVHlwZS5QcmltaXRpdmVUeXBlSAASMgoKd2VsbF9rbm93bhgFIAEoDjIcLmNlbC5leHByLlR5cGUuV2VsbEtub3duVHlwZUgAEiwKCWxpc3RfdHlwZRgGIAEoCzIXLmNlbC5leHByLlR5cGUuTGlzdFR5cGVIABIqCghtYXBfdHlwZRgHIAEoCzIWLmNlbC5leHByLlR5cGUuTWFwVHlwZUgAEi8KCGZ1bmN0aW9uGAggASgLMhsuY2VsLmV4cHIuVHlwZS5GdW5jdGlvblR5cGVIABIWCgxtZXNzYWdlX3R5cGUYCSABKAlIABIUCgp0eXBlX3BhcmFtGAogASgJSAASHgoEdHlwZRgLIAEoCzIOLmNlbC5leHByLlR5cGVIABInCgVlcnJvchgMIAEoCzIWLmdvb2dsZS5wcm90b2J1Zi5FbXB0eUgAEjQKDWFic3RyYWN0X3R5cGUYDiABKAsyGy5jZWwuZXhwci5UeXBlLkFic3RyYWN0VHlwZUgAGi0KCExpc3RUeXBlEiEKCWVsZW1fdHlwZRgBIAEoCzIOLmNlbC5leHByLlR5cGUaTwoHTWFwVHlwZRIgCghrZXlfdHlwZRgBIAEoCzIOLmNlbC5leHByLlR5cGUSIgoKdmFsdWVfdHlwZRgCIAEoCzIOLmNlbC5leHByLlR5cGUaVgoMRnVuY3Rpb25UeXBlEiMKC3Jlc3VsdF90eXBlGAEgASgLMg4uY2VsLmV4cHIuVHlwZRIhCglhcmdfdHlwZXMYAiADKAsyDi5jZWwuZXhwci5UeXBlGkUKDEFic3RyYWN0VHlwZRIMCgRuYW1lGAEgASgJEicKD3BhcmFtZXRlcl90eXBlcxgCIAMoCzIOLmNlbC5leHByLlR5cGUicwoNUHJpbWl0aXZlVHlwZRIeChpQUklNSVRJVkVfVFlQRV9VTlNQRUNJRklFRBAAEggKBEJPT0wQARIJCgVJTlQ2NBACEgoKBlVJTlQ2NBADEgoKBkRPVUJMRRAEEgoKBlNUUklORxAFEgkKBUJZVEVTEAYiVgoNV2VsbEtub3duVHlwZRIfChtXRUxMX0tOT1dOX1RZUEVfVU5TUEVDSUZJRUQQABIHCgNBTlkQARINCglUSU1FU1RBTVAQAhIMCghEVVJBVElPThADQgsKCXR5cGVfa2luZCLJAwoERGVjbBIMCgRuYW1lGAEgASgJEikKBWlkZW50GAIgASgLMhguY2VsLmV4cHIuRGVjbC5JZGVudERlY2xIABIvCghmdW5jdGlvbhgDIAEoCzIbLmNlbC5leHByLkRlY2wuRnVuY3Rpb25EZWNsSAAaWQoJSWRlbnREZWNsEhwKBHR5cGUYASABKAsyDi5jZWwuZXhwci5UeXBlEiEKBXZhbHVlGAIgASgLMhIuY2VsLmV4cHIuQ29uc3RhbnQSCwoDZG9jGAMgASgJGu4BCgxGdW5jdGlvbkRlY2wSNwoJb3ZlcmxvYWRzGAEgAygLMiQuY2VsLmV4cHIuRGVjbC5GdW5jdGlvbkRlY2wuT3ZlcmxvYWQapAEKCE92ZXJsb2FkEhMKC292ZXJsb2FkX2lkGAEgASgJEh4KBnBhcmFtcxgCIAMoCzIOLmNlbC5leHByLlR5cGUSEwoLdHlwZV9wYXJhbXMYAyADKAkSIwoLcmVzdWx0X3R5cGUYBCABKAsyDi5jZWwuZXhwci5UeXBlEhwKFGlzX2luc3RhbmNlX2Z1bmN0aW9uGAUgASgIEgsKA2RvYxgGIAEoCUILCglkZWNsX2tpbmQiUQoJUmVmZXJlbmNlEgwKBG5hbWUYASABKAkSEwoLb3ZlcmxvYWRfaWQYAyADKAkSIQoFdmFsdWUYBCABKAsyEi5jZWwuZXhwci5Db25zdGFudEIsCgxkZXYuY2VsLmV4cHJCCURlY2xQcm90b1ABWgxjZWwuZGV2L2V4cHL4AQFiBnByb3RvMw", [file_cel_expr_syntax, file_google_protobuf_empty, file_google_protobuf_struct]);

/**
 * A CEL expression which has been successfully type checked.
 *
 * @generated from message cel.expr.CheckedExpr
 */
export type CheckedExpr = Message<"cel.expr.CheckedExpr"> & {
  /**
   * A map from expression ids to resolved references.
   *
   * The following entries are in this table:
   *
   * - An Ident or Select expression is represented here if it resolves to a
   *   declaration. For instance, if `a.b.c` is represented by
   *   `select(select(id(a), b), c)`, and `a.b` resolves to a declaration,
   *   while `c` is a field selection, then the reference is attached to the
   *   nested select expression (but not to the id or or the outer select).
   *   In turn, if `a` resolves to a declaration and `b.c` are field selections,
   *   the reference is attached to the ident expression.
   * - Every Call expression has an entry here, identifying the function being
   *   called.
   * - Every CreateStruct expression for a message has an entry, identifying
   *   the message.
   *
   * @generated from field: map<int64, cel.expr.Reference> reference_map = 2;
   */
  referenceMap: { [key: string]: Reference };

  /**
   * A map from expression ids to types.
   *
   * Every expression node which has a type different than DYN has a mapping
   * here. If an expression has type DYN, it is omitted from this map to save
   * space.
   *
   * @generated from field: map<int64, cel.expr.Type> type_map = 3;
   */
  typeMap: { [key: string]: Type };

  /**
   * The source info derived from input that generated the parsed `expr` and
   * any optimizations made during the type-checking pass.
   *
   * @generated from field: cel.expr.SourceInfo source_info = 5;
   */
  sourceInfo?: SourceInfo;

  /**
   * The expr version indicates the major / minor version number of the `expr`
   * representation.
   *
   * The most common reason for a version change will be to indicate to the CEL
   * runtimes that transformations have been performed on the expr during static
   * analysis. In some cases, this will save the runtime the work of applying
   * the same or similar transformations prior to evaluation.
   *
   * @generated from field: string expr_version = 6;
   */
  exprVersion: string;

  /**
   * The checked expression. Semantically equivalent to the parsed `expr`, but
   * may have structural differences.
   *
   * @generated from field: cel.expr.Expr expr = 4;
   */
  expr?: Expr;
};

/**
 * Describes the message cel.expr.CheckedExpr.
 * Use `create(CheckedExprSchema)` to create a new message.
 */
export const CheckedExprSchema: GenMessage<CheckedExpr> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 0);

/**
 * Represents a CEL type.
 *
 * @generated from message cel.expr.Type
 */
export type Type = Message<"cel.expr.Type"> & {
  /**
   * The kind of type.
   *
   * @generated from oneof cel.expr.Type.type_kind
   */
  typeKind: {
    /**
     * Dynamic type.
     *
     * @generated from field: google.protobuf.Empty dyn = 1;
     */
    value: Empty;
    case: "dyn";
  } | {
    /**
     * Null value.
     *
     * @generated from field: google.protobuf.NullValue null = 2;
     */
    value: NullValue;
    case: "null";
  } | {
    /**
     * Primitive types: `true`, `1u`, `-2.0`, `'string'`, `b'bytes'`.
     *
     * @generated from field: cel.expr.Type.PrimitiveType primitive = 3;
     */
    value: Type_PrimitiveType;
    case: "primitive";
  } | {
    /**
     * Wrapper of a primitive type, e.g. `google.protobuf.Int64Value`.
     *
     * @generated from field: cel.expr.Type.PrimitiveType wrapper = 4;
     */
    value: Type_PrimitiveType;
    case: "wrapper";
  } | {
    /**
     * Well-known protobuf type such as `google.protobuf.Timestamp`.
     *
     * @generated from field: cel.expr.Type.WellKnownType well_known = 5;
     */
    value: Type_WellKnownType;
    case: "wellKnown";
  } | {
    /**
     * Parameterized list with elements of `list_type`, e.g. `list<timestamp>`.
     *
     * @generated from field: cel.expr.Type.ListType list_type = 6;
     */
    value: Type_ListType;
    case: "listType";
  } | {
    /**
     * Parameterized map with typed keys and values.
     *
     * @generated from field: cel.expr.Type.MapType map_type = 7;
     */
    value: Type_MapType;
    case: "mapType";
  } | {
    /**
     * Function type.
     *
     * @generated from field: cel.expr.Type.FunctionType function = 8;
     */
    value: Type_FunctionType;
    case: "function";
  } | {
    /**
     * Protocol buffer message type.
     *
     * The `message_type` string specifies the qualified message type name. For
     * example, `google.type.PhoneNumber`.
     *
     * @generated from field: string message_type = 9;
     */
    value: string;
    case: "messageType";
  } | {
    /**
     * Type param type.
     *
     * The `type_param` string specifies the type parameter name, e.g. `list<E>`
     * would be a `list_type` whose element type was a `type_param` type
     * named `E`.
     *
     * @generated from field: string type_param = 10;
     */
    value: string;
    case: "typeParam";
  } | {
    /**
     * Type type.
     *
     * The `type` value specifies the target type. e.g. int is type with a
     * target type of `Primitive.INT64`.
     *
     * @generated from field: cel.expr.Type type = 11;
     */
    value: Type;
    case: "type";
  } | {
    /**
     * Error type.
     *
     * During type-checking if an expression is an error, its type is propagated
     * as the `ERROR` type. This permits the type-checker to discover other
     * errors present in the expression.
     *
     * @generated from field: google.protobuf.Empty error = 12;
     */
    value: Empty;
    case: "error";
  } | {
    /**
     * Abstract, application defined type.
     *
     * An abstract type has no accessible field names, and it can only be
     * inspected via helper / member functions.
     *
     * @generated from field: cel.expr.Type.AbstractType abstract_type = 14;
     */
    value: Type_AbstractType;
    case: "abstractType";
  } | { case: undefined; value?: undefined };
};

/**
 * Describes the message cel.expr.Type.
 * Use `create(TypeSchema)` to create a new message.
 */
export const TypeSchema: GenMessage<Type> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 1);

/**
 * List type with typed elements, e.g. `list<example.proto.MyMessage>`.
 *
 * @generated from message cel.expr.Type.ListType
 */
export type Type_ListType = Message<"cel.expr.Type.ListType"> & {
  /**
   * The element type.
   *
   * @generated from field: cel.expr.Type elem_type = 1;
   */
  elemType?: Type;
};

/**
 * Describes the message cel.expr.Type.ListType.
 * Use `create(Type_ListTypeSchema)` to create a new message.
 */
export const Type_ListTypeSchema: GenMessage<Type_ListType> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 1, 0);

/**
 * Map type with parameterized key and value types, e.g. `map<string, int>`.
 *
 * @generated from message cel.expr.Type.MapType
 */
export type Type_MapType = Message<"cel.expr.Type.MapType"> & {
  /**
   * The type of the key.
   *
   * @generated from field: cel.expr.Type key_type = 1;
   */
  keyType?: Type;

  /**
   * The type of the value.
   *
   * @generated from field: cel.expr.Type value_type = 2;
   */
  valueType?: Type;
};

/**
 * Describes the message cel.expr.Type.MapType.
 * Use `create(Type_MapTypeSchema)` to create a new message.
 */
export const Type_MapTypeSchema: GenMessage<Type_MapType> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 1, 1);

/**
 * Function type with result and arg types.
 *
 * @generated from message cel.expr.Type.FunctionType
 */
export type Type_FunctionType = Message<"cel.expr.Type.FunctionType"> & {
  /**
   * Result type of the function.
   *
   * @generated from field: cel.expr.Type result_type = 1;
   */
  resultType?: Type;

  /**
   * Argument types of the function.
   *
   * @generated from field: repeated cel.expr.Type arg_types = 2;
   */
  argTypes: Type[];
};

/**
 * Describes the message cel.expr.Type.FunctionType.
 * Use `create(Type_FunctionTypeSchema)` to create a new message.
 */
export const Type_FunctionTypeSchema: GenMessage<Type_FunctionType> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 1, 2);

/**
 * Application defined abstract type.
 *
 * @generated from message cel.expr.Type.AbstractType
 */
export type Type_AbstractType = Message<"cel.expr.Type.AbstractType"> & {
  /**
   * The fully qualified name of this abstract type.
   *
   * @generated from field: string name = 1;
   */
  name: string;

  /**
   * Parameter types for this abstract type.
   *
   * @generated from field: repeated cel.expr.Type parameter_types = 2;
   */
  parameterTypes: Type[];
};

/**
 * Describes the message cel.expr.Type.AbstractType.
 * Use `create(Type_AbstractTypeSchema)` to create a new message.
 */
export const Type_AbstractTypeSchema: GenMessage<Type_AbstractType> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 1, 3);

/**
 * CEL primitive types.
 *
 * @generated from enum cel.expr.Type.PrimitiveType
 */
export enum Type_PrimitiveType {
  /**
   * Unspecified type.
   *
   * @generated from enum value: PRIMITIVE_TYPE_UNSPECIFIED = 0;
   */
  PRIMITIVE_TYPE_UNSPECIFIED = 0,

  /**
   * Boolean type.
   *
   * @generated from enum value: BOOL = 1;
   */
  BOOL = 1,

  /**
   * Int64 type.
   *
   * 32-bit integer values are widened to int64.
   *
   * @generated from enum value: INT64 = 2;
   */
  INT64 = 2,

  /**
   * Uint64 type.
   *
   * 32-bit unsigned integer values are widened to uint64.
   *
   * @generated from enum value: UINT64 = 3;
   */
  UINT64 = 3,

  /**
   * Double type.
   *
   * 32-bit float values are widened to double values.
   *
   * @generated from enum value: DOUBLE = 4;
   */
  DOUBLE = 4,

  /**
   * String type.
   *
   * @generated from enum value: STRING = 5;
   */
  STRING = 5,

  /**
   * Bytes type.
   *
   * @generated from enum value: BYTES = 6;
   */
  BYTES = 6,
}

/**
 * Describes the enum cel.expr.Type.PrimitiveType.
 */
export const Type_PrimitiveTypeSchema: GenEnum<Type_PrimitiveType> = /*@__PURE__*/
  enumDesc(file_cel_expr_checked, 1, 0);

/**
 * Well-known protobuf types treated with first-class support in CEL.
 *
 * @generated from enum cel.expr.Type.WellKnownType
 */
export enum Type_WellKnownType {
  /**
   * Unspecified type.
   *
   * @generated from enum value: WELL_KNOWN_TYPE_UNSPECIFIED = 0;
   */
  WELL_KNOWN_TYPE_UNSPECIFIED = 0,

  /**
   * Well-known protobuf.Any type.
   *
   * Any types are a polymorphic message type. During type-checking they are
   * treated like `DYN` types, but at runtime they are resolved to a specific
   * message type specified at evaluation time.
   *
   * @generated from enum value: ANY = 1;
   */
  ANY = 1,

  /**
   * Well-known protobuf.Timestamp type, internally referenced as `timestamp`.
   *
   * @generated from enum value: TIMESTAMP = 2;
   */
  TIMESTAMP = 2,

  /**
   * Well-known protobuf.Duration type, internally referenced as `duration`.
   *
   * @generated from enum value: DURATION = 3;
   */
  DURATION = 3,
}

/**
 * Describes the enum cel.expr.Type.WellKnownType.
 */
export const Type_WellKnownTypeSchema: GenEnum<Type_WellKnownType> = /*@__PURE__*/
  enumDesc(file_cel_expr_checked, 1, 1);

/**
 * Represents a declaration of a named value or function.
 *
 * A declaration is part of the contract between the expression, the agent
 * evaluating that expression, and the caller requesting evaluation.
 *
 * @generated from message cel.expr.Decl
 */
export type Decl = Message<"cel.expr.Decl"> & {
  /**
   * The fully qualified name of the declaration.
   *
   * Declarations are organized in containers and this represents the full path
   * to the declaration in its container, as in `cel.expr.Decl`.
   *
   * Declarations used as
   * [FunctionDecl.Overload][cel.expr.Decl.FunctionDecl.Overload]
   * parameters may or may not have a name depending on whether the overload is
   * function declaration or a function definition containing a result
   * [Expr][cel.expr.Expr].
   *
   * @generated from field: string name = 1;
   */
  name: string;

  /**
   * Required. The declaration kind.
   *
   * @generated from oneof cel.expr.Decl.decl_kind
   */
  declKind: {
    /**
     * Identifier declaration.
     *
     * @generated from field: cel.expr.Decl.IdentDecl ident = 2;
     */
    value: Decl_IdentDecl;
    case: "ident";
  } | {
    /**
     * Function declaration.
     *
     * @generated from field: cel.expr.Decl.FunctionDecl function = 3;
     */
    value: Decl_FunctionDecl;
    case: "function";
  } | { case: undefined; value?: undefined };
};

/**
 * Describes the message cel.expr.Decl.
 * Use `create(DeclSchema)` to create a new message.
 */
export const DeclSchema: GenMessage<Decl> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 2);

/**
 * Identifier declaration which specifies its type and optional `Expr` value.
 *
 * An identifier without a value is a declaration that must be provided at
 * evaluation time. An identifier with a value should resolve to a constant,
 * but may be used in conjunction with other identifiers bound at evaluation
 * time.
 *
 * @generated from message cel.expr.Decl.IdentDecl
 */
export type Decl_IdentDecl = Message<"cel.expr.Decl.IdentDecl"> & {
  /**
   * Required. The type of the identifier.
   *
   * @generated from field: cel.expr.Type type = 1;
   */
  type?: Type;

  /**
   * The constant value of the identifier. If not specified, the identifier
   * must be supplied at evaluation time.
   *
   * @generated from field: cel.expr.Constant value = 2;
   */
  value?: Constant;

  /**
   * Documentation string for the identifier.
   *
   * @generated from field: string doc = 3;
   */
  doc: string;
};

/**
 * Describes the message cel.expr.Decl.IdentDecl.
 * Use `create(Decl_IdentDeclSchema)` to create a new message.
 */
export const Decl_IdentDeclSchema: GenMessage<Decl_IdentDecl> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 2, 0);

/**
 * Function declaration specifies one or more overloads which indicate the
 * function's parameter types and return type.
 *
 * Functions have no observable side-effects (there may be side-effects like
 * logging which are not observable from CEL).
 *
 * @generated from message cel.expr.Decl.FunctionDecl
 */
export type Decl_FunctionDecl = Message<"cel.expr.Decl.FunctionDecl"> & {
  /**
   * Required. List of function overloads, must contain at least one overload.
   *
   * @generated from field: repeated cel.expr.Decl.FunctionDecl.Overload overloads = 1;
   */
  overloads: Decl_FunctionDecl_Overload[];
};

/**
 * Describes the message cel.expr.Decl.FunctionDecl.
 * Use `create(Decl_FunctionDeclSchema)` to create a new message.
 */
export const Decl_FunctionDeclSchema: GenMessage<Decl_FunctionDecl> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 2, 1);

/**
 * An overload indicates a function's parameter types and return type, and
 * may optionally include a function body described in terms of
 * [Expr][cel.expr.Expr] values.
 *
 * Functions overloads are declared in either a function or method
 * call-style. For methods, the `params[0]` is the expected type of the
 * target receiver.
 *
 * Overloads must have non-overlapping argument types after erasure of all
 * parameterized type variables (similar as type erasure in Java).
 *
 * @generated from message cel.expr.Decl.FunctionDecl.Overload
 */
export type Decl_FunctionDecl_Overload = Message<"cel.expr.Decl.FunctionDecl.Overload"> & {
  /**
   * Required. Globally unique overload name of the function which reflects
   * the function name and argument types.
   *
   * This will be used by a [Reference][cel.expr.Reference] to
   * indicate the `overload_id` that was resolved for the function `name`.
   *
   * @generated from field: string overload_id = 1;
   */
  overloadId: string;

  /**
   * List of function parameter [Type][cel.expr.Type] values.
   *
   * Param types are disjoint after generic type parameters have been
   * replaced with the type `DYN`. Since the `DYN` type is compatible with
   * any other type, this means that if `A` is a type parameter, the
   * function types `int<A>` and `int<int>` are not disjoint. Likewise,
   * `map<string, string>` is not disjoint from `map<K, V>`.
   *
   * When the `result_type` of a function is a generic type param, the
   * type param name also appears as the `type` of on at least one params.
   *
   * @generated from field: repeated cel.expr.Type params = 2;
   */
  params: Type[];

  /**
   * The type param names associated with the function declaration.
   *
   * For example, `function ex<K,V>(K key, map<K, V> map) : V` would yield
   * the type params of `K, V`.
   *
   * @generated from field: repeated string type_params = 3;
   */
  typeParams: string[];

  /**
   * Required. The result type of the function. For example, the operator
   * `string.isEmpty()` would have `result_type` of `kind: BOOL`.
   *
   * @generated from field: cel.expr.Type result_type = 4;
   */
  resultType?: Type;

  /**
   * Whether the function is to be used in a method call-style `x.f(...)`
   * of a function call-style `f(x, ...)`.
   *
   * For methods, the first parameter declaration, `params[0]` is the
   * expected type of the target receiver.
   *
   * @generated from field: bool is_instance_function = 5;
   */
  isInstanceFunction: boolean;

  /**
   * Documentation string for the overload.
   *
   * @generated from field: string doc = 6;
   */
  doc: string;
};

/**
 * Describes the message cel.expr.Decl.FunctionDecl.Overload.
 * Use `create(Decl_FunctionDecl_OverloadSchema)` to create a new message.
 */
export const Decl_FunctionDecl_OverloadSchema: GenMessage<Decl_FunctionDecl_Overload> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 2, 1, 0);

/**
 * Describes a resolved reference to a declaration.
 *
 * @generated from message cel.expr.Reference
 */
export type Reference = Message<"cel.expr.Reference"> & {
  /**
   * The fully qualified name of the declaration.
   *
   * @generated from field: string name = 1;
   */
  name: string;

  /**
   * For references to functions, this is a list of `Overload.overload_id`
   * values which match according to typing rules.
   *
   * If the list has more than one element, overload resolution among the
   * presented candidates must happen at runtime because of dynamic types. The
   * type checker attempts to narrow down this list as much as possible.
   *
   * Empty if this is not a reference to a
   * [Decl.FunctionDecl][cel.expr.Decl.FunctionDecl].
   *
   * @generated from field: repeated string overload_id = 3;
   */
  overloadId: string[];

  /**
   * For references to constants, this may contain the value of the
   * constant if known at compile time.
   *
   * @generated from field: cel.expr.Constant value = 4;
   */
  value?: Constant;
};

/**
 * Describes the message cel.expr.Reference.
 * Use `create(ReferenceSchema)` to create a new message.
 */
export const ReferenceSchema: GenMessage<Reference> = /*@__PURE__*/
  messageDesc(file_cel_expr_checked, 3);

