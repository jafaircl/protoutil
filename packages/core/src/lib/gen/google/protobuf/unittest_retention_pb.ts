// Protocol Buffers - Google's data interchange format
// Copyright 2008 Google Inc.  All rights reserved.
//
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file or at
// https://developers.google.com/open-source/licenses/bsd

// @generated by protoc-gen-es v2.5.1 with parameter "target=ts,import_extension=.js,ts_nocheck=false"
// @generated from file google/protobuf/unittest_retention.proto (package proto2_unittest, syntax proto2)
/* eslint-disable */

import type { GenEnum, GenExtension, GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv2";
import { enumDesc, extDesc, fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv2";
import type { EnumOptions, EnumValueOptions, ExtensionRangeOptions, FieldOptions, FileOptions, MessageOptions, MethodOptions, OneofOptions, ServiceOptions } from "@bufbuild/protobuf/wkt";
import { file_google_protobuf_descriptor } from "@bufbuild/protobuf/wkt";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file google/protobuf/unittest_retention.proto.
 */
export const file_google_protobuf_unittest_retention: GenFile = /*@__PURE__*/
  fileDesc("Cihnb29nbGUvcHJvdG9idWYvdW5pdHRlc3RfcmV0ZW50aW9uLnByb3RvEg9wcm90bzJfdW5pdHRlc3QicAoOT3B0aW9uc01lc3NhZ2USEwoLcGxhaW5fZmllbGQYASABKAUSJAoXcnVudGltZV9yZXRlbnRpb25fZmllbGQYAiABKAVCA4gBARIjChZzb3VyY2VfcmV0ZW50aW9uX2ZpZWxkGAMgASgFQgOIAQIiFgoIRXh0ZW5kZWUqBAgBEAIqBAgCEAMi8gEKD1RvcExldmVsTWVzc2FnZRIXCgFmGAEgASgCQgyauu2EDwYIARACGAMSCwoBaRgCIAEoA0gAGh0KDU5lc3RlZE1lc3NhZ2U6DJrF3oUPBggBEAIYAyIuCgpOZXN0ZWRFbnVtEhIKDk5FU1RFRF9VTktOT1dOEAAaDPqeqoQPBggBEAIYAyoSCAoQZRoMopjfhQ8GCAEQAhgDMjUKAXMSGS5wcm90bzJfdW5pdHRlc3QuRXh0ZW5kZWUYAiABKAlCDJq67YQPBggBEAIYA1IBczoMmsXehQ8GCAEQAhgDQhEKAW8SDIrbt4QPBggBEAIYAypBCgxUb3BMZXZlbEVudW0SIwoRVE9QX0xFVkVMX1VOS05PV04QABoM0t2phA8GCAEQAhgDGgz6nqqEDwYIARACGAMydAoHU2VydmljZRJbCgdEb1N0dWZmEiAucHJvdG8yX3VuaXR0ZXN0LlRvcExldmVsTWVzc2FnZRogLnByb3RvMl91bml0dGVzdC5Ub3BMZXZlbE1lc3NhZ2UiDOKu+IMPBggBEAIYAxoM6oeLhA8GCAEQAhgDOkMKDHBsYWluX29wdGlvbhIcLmdvb2dsZS5wcm90b2J1Zi5GaWxlT3B0aW9ucxjGtezwASABKAVSC3BsYWluT3B0aW9uOl8KGHJ1bnRpbWVfcmV0ZW50aW9uX29wdGlvbhIcLmdvb2dsZS5wcm90b2J1Zi5GaWxlT3B0aW9ucxickunwASABKAVCA4gBAVIWcnVudGltZVJldGVudGlvbk9wdGlvbjpdChdzb3VyY2VfcmV0ZW50aW9uX29wdGlvbhIcLmdvb2dsZS5wcm90b2J1Zi5GaWxlT3B0aW9ucxjUrN/wASABKAVCA4gBAlIVc291cmNlUmV0ZW50aW9uT3B0aW9uOmIKC2ZpbGVfb3B0aW9uEhwuZ29vZ2xlLnByb3RvYnVmLkZpbGVPcHRpb25zGIDy3vABIAEoCzIfLnByb3RvMl91bml0dGVzdC5PcHRpb25zTWVzc2FnZVIKZmlsZU9wdGlvbjpsChByZXBlYXRlZF9vcHRpb25zEhwuZ29vZ2xlLnByb3RvYnVmLkZpbGVPcHRpb25zGJL+2/ABIAMoCzIfLnByb3RvMl91bml0dGVzdC5PcHRpb25zTWVzc2FnZVIPcmVwZWF0ZWRPcHRpb25zOoEBChZleHRlbnNpb25fcmFuZ2Vfb3B0aW9uEiYuZ29vZ2xlLnByb3RvYnVmLkV4dGVuc2lvblJhbmdlT3B0aW9ucxiE89vwASABKAsyHy5wcm90bzJfdW5pdHRlc3QuT3B0aW9uc01lc3NhZ2VSFGV4dGVuc2lvblJhbmdlT3B0aW9uOmsKDm1lc3NhZ2Vfb3B0aW9uEh8uZ29vZ2xlLnByb3RvYnVmLk1lc3NhZ2VPcHRpb25zGNPo2/ABIAEoCzIfLnByb3RvMl91bml0dGVzdC5PcHRpb25zTWVzc2FnZVINbWVzc2FnZU9wdGlvbjplCgxmaWVsZF9vcHRpb24SHS5nb29nbGUucHJvdG9idWYuRmllbGRPcHRpb25zGKPXzfABIAEoCzIfLnByb3RvMl91bml0dGVzdC5PcHRpb25zTWVzc2FnZVILZmllbGRPcHRpb246ZQoMb25lb2Zfb3B0aW9uEh0uZ29vZ2xlLnByb3RvYnVmLk9uZW9mT3B0aW9ucxix+8bwASABKAsyHy5wcm90bzJfdW5pdHRlc3QuT3B0aW9uc01lc3NhZ2VSC29uZW9mT3B0aW9uOmIKC2VudW1fb3B0aW9uEhwuZ29vZ2xlLnByb3RvYnVmLkVudW1PcHRpb25zGO+jxfABIAEoCzIfLnByb3RvMl91bml0dGVzdC5PcHRpb25zTWVzc2FnZVIKZW51bU9wdGlvbjpyChFlbnVtX2VudHJ5X29wdGlvbhIhLmdvb2dsZS5wcm90b2J1Zi5FbnVtVmFsdWVPcHRpb25zGNqbxfABIAEoCzIfLnByb3RvMl91bml0dGVzdC5PcHRpb25zTWVzc2FnZVIPZW51bUVudHJ5T3B0aW9uOmsKDnNlcnZpY2Vfb3B0aW9uEh8uZ29vZ2xlLnByb3RvYnVmLlNlcnZpY2VPcHRpb25zGP2wwfABIAEoCzIfLnByb3RvMl91bml0dGVzdC5PcHRpb25zTWVzc2FnZVINc2VydmljZU9wdGlvbjpoCg1tZXRob2Rfb3B0aW9uEh4uZ29vZ2xlLnByb3RvYnVmLk1ldGhvZE9wdGlvbnMY7IW/8AEgASgLMh8ucHJvdG8yX3VuaXR0ZXN0Lk9wdGlvbnNNZXNzYWdlUgxtZXRob2RPcHRpb246NQoBaRIZLnByb3RvMl91bml0dGVzdC5FeHRlbmRlZRgBIAEoBUIMmrrthA8GCAEQAhgDUgFpQjeqAhBQcm90b2J1ZlVuaXR0ZXN0kvHfhQ8GCAEQAhgDgpD3hQ8GCAEQAhgD4JHJhg8CsKzjhg8B", [file_google_protobuf_descriptor]);

/**
 * Retention attributes set on fields nested within a message
 *
 * @generated from message proto2_unittest.OptionsMessage
 */
export type OptionsMessage = Message<"proto2_unittest.OptionsMessage"> & {
  /**
   * @generated from field: optional int32 plain_field = 1;
   */
  plainField: number;

  /**
   * @generated from field: optional int32 runtime_retention_field = 2;
   */
  runtimeRetentionField: number;

  /**
   * @generated from field: optional int32 source_retention_field = 3;
   */
  sourceRetentionField: number;
};

/**
 * Describes the message proto2_unittest.OptionsMessage.
 * Use `create(OptionsMessageSchema)` to create a new message.
 */
export const OptionsMessageSchema: GenMessage<OptionsMessage> = /*@__PURE__*/
  messageDesc(file_google_protobuf_unittest_retention, 0);

/**
 * @generated from message proto2_unittest.Extendee
 */
export type Extendee = Message<"proto2_unittest.Extendee"> & {
};

/**
 * Describes the message proto2_unittest.Extendee.
 * Use `create(ExtendeeSchema)` to create a new message.
 */
export const ExtendeeSchema: GenMessage<Extendee> = /*@__PURE__*/
  messageDesc(file_google_protobuf_unittest_retention, 1);

/**
 * @generated from message proto2_unittest.TopLevelMessage
 */
export type TopLevelMessage = Message<"proto2_unittest.TopLevelMessage"> & {
  /**
   * @generated from field: optional float f = 1;
   */
  f: number;

  /**
   * @generated from oneof proto2_unittest.TopLevelMessage.o
   */
  o: {
    /**
     * @generated from field: int64 i = 2;
     */
    value: bigint;
    case: "i";
  } | { case: undefined; value?: undefined };
};

/**
 * Describes the message proto2_unittest.TopLevelMessage.
 * Use `create(TopLevelMessageSchema)` to create a new message.
 */
export const TopLevelMessageSchema: GenMessage<TopLevelMessage> = /*@__PURE__*/
  messageDesc(file_google_protobuf_unittest_retention, 2);

/**
 * @generated from message proto2_unittest.TopLevelMessage.NestedMessage
 */
export type TopLevelMessage_NestedMessage = Message<"proto2_unittest.TopLevelMessage.NestedMessage"> & {
};

/**
 * Describes the message proto2_unittest.TopLevelMessage.NestedMessage.
 * Use `create(TopLevelMessage_NestedMessageSchema)` to create a new message.
 */
export const TopLevelMessage_NestedMessageSchema: GenMessage<TopLevelMessage_NestedMessage> = /*@__PURE__*/
  messageDesc(file_google_protobuf_unittest_retention, 2, 0);

/**
 * @generated from enum proto2_unittest.TopLevelMessage.NestedEnum
 */
export enum TopLevelMessage_NestedEnum {
  /**
   * @generated from enum value: NESTED_UNKNOWN = 0;
   */
  NESTED_UNKNOWN = 0,
}

/**
 * Describes the enum proto2_unittest.TopLevelMessage.NestedEnum.
 */
export const TopLevelMessage_NestedEnumSchema: GenEnum<TopLevelMessage_NestedEnum> = /*@__PURE__*/
  enumDesc(file_google_protobuf_unittest_retention, 2, 0);

/**
 * @generated from extension: optional string s = 2;
 */
export const TopLevelMessage_s: GenExtension<Extendee, string> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 2, 0);

/**
 * @generated from enum proto2_unittest.TopLevelEnum
 */
export enum TopLevelEnum {
  /**
   * @generated from enum value: TOP_LEVEL_UNKNOWN = 0;
   */
  TOP_LEVEL_UNKNOWN = 0,
}

/**
 * Describes the enum proto2_unittest.TopLevelEnum.
 */
export const TopLevelEnumSchema: GenEnum<TopLevelEnum> = /*@__PURE__*/
  enumDesc(file_google_protobuf_unittest_retention, 0);

/**
 * @generated from service proto2_unittest.Service
 */
export const Service: GenService<{
  /**
   * @generated from rpc proto2_unittest.Service.DoStuff
   */
  doStuff: {
    methodKind: "unary";
    input: typeof TopLevelMessageSchema;
    output: typeof TopLevelMessageSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_google_protobuf_unittest_retention, 0);

/**
 * @generated from extension: optional int32 plain_option = 505092806;
 */
export const plain_option: GenExtension<FileOptions, number> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 0);

/**
 * @generated from extension: optional int32 runtime_retention_option = 505039132;
 */
export const runtime_retention_option: GenExtension<FileOptions, number> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 1);

/**
 * @generated from extension: optional int32 source_retention_option = 504878676;
 */
export const source_retention_option: GenExtension<FileOptions, number> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 2);

/**
 * @generated from extension: optional proto2_unittest.OptionsMessage file_option = 504871168;
 */
export const file_option: GenExtension<FileOptions, OptionsMessage> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 3);

/**
 * @generated from extension: repeated proto2_unittest.OptionsMessage repeated_options = 504823570;
 */
export const repeated_options: GenExtension<FileOptions, OptionsMessage[]> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 4);

/**
 * @generated from extension: optional proto2_unittest.OptionsMessage extension_range_option = 504822148;
 */
export const extension_range_option: GenExtension<ExtensionRangeOptions, OptionsMessage> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 5);

/**
 * @generated from extension: optional proto2_unittest.OptionsMessage message_option = 504820819;
 */
export const message_option: GenExtension<MessageOptions, OptionsMessage> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 6);

/**
 * @generated from extension: optional proto2_unittest.OptionsMessage field_option = 504589219;
 */
export const field_option: GenExtension<FieldOptions, OptionsMessage> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 7);

/**
 * @generated from extension: optional proto2_unittest.OptionsMessage oneof_option = 504479153;
 */
export const oneof_option: GenExtension<OneofOptions, OptionsMessage> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 8);

/**
 * @generated from extension: optional proto2_unittest.OptionsMessage enum_option = 504451567;
 */
export const enum_option: GenExtension<EnumOptions, OptionsMessage> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 9);

/**
 * @generated from extension: optional proto2_unittest.OptionsMessage enum_entry_option = 504450522;
 */
export const enum_entry_option: GenExtension<EnumValueOptions, OptionsMessage> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 10);

/**
 * @generated from extension: optional proto2_unittest.OptionsMessage service_option = 504387709;
 */
export const service_option: GenExtension<ServiceOptions, OptionsMessage> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 11);

/**
 * @generated from extension: optional proto2_unittest.OptionsMessage method_option = 504349420;
 */
export const method_option: GenExtension<MethodOptions, OptionsMessage> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 12);

/**
 * @generated from extension: optional int32 i = 1;
 */
export const i: GenExtension<Extendee, number> = /*@__PURE__*/
  extDesc(file_google_protobuf_unittest_retention, 13);

