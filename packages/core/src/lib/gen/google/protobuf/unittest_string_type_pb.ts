// @generated by protoc-gen-es v2.5.1 with parameter "target=ts,import_extension=.js,ts_nocheck=false"
// @generated from file google/protobuf/unittest_string_type.proto (package proto2_unittest, edition 2023)
/* eslint-disable */

import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv2";
import { fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv2";
import { file_google_protobuf_cpp_features } from "@bufbuild/protobuf/wkt";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file google/protobuf/unittest_string_type.proto.
 */
export const file_google_protobuf_unittest_string_type: GenFile = /*@__PURE__*/
  fileDesc("Cipnb29nbGUvcHJvdG9idWYvdW5pdHRlc3Rfc3RyaW5nX3R5cGUucHJvdG8SD3Byb3RvMl91bml0dGVzdCIlCgpFbnRyeVByb3RvEhcKBXZhbHVlGAMgASgMQgiqAQXCPgIQAmIIZWRpdGlvbnNw6Ac", [file_google_protobuf_cpp_features]);

/**
 * @generated from message proto2_unittest.EntryProto
 */
export type EntryProto = Message<"proto2_unittest.EntryProto"> & {
  /**
   * @generated from field: bytes value = 3;
   */
  value: Uint8Array;
};

/**
 * Describes the message proto2_unittest.EntryProto.
 * Use `create(EntryProtoSchema)` to create a new message.
 */
export const EntryProtoSchema: GenMessage<EntryProto> = /*@__PURE__*/
  messageDesc(file_google_protobuf_unittest_string_type, 0);

