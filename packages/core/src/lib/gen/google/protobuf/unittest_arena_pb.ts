// @generated by protoc-gen-es v2.5.1 with parameter "target=ts,import_extension=.js,ts_nocheck=false"
// @generated from file google/protobuf/unittest_arena.proto (package proto2_arena_unittest, edition 2023)
// option features.repeated_field_encoding = EXPANDED;
/* eslint-disable */

import type { GenFile, GenMessage } from "@bufbuild/protobuf/codegenv2";
import { fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv2";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file google/protobuf/unittest_arena.proto.
 */
export const file_google_protobuf_unittest_arena: GenFile = /*@__PURE__*/
  fileDesc("CiRnb29nbGUvcHJvdG9idWYvdW5pdHRlc3RfYXJlbmEucHJvdG8SFXByb3RvMl9hcmVuYV91bml0dGVzdCIaCg1OZXN0ZWRNZXNzYWdlEgkKAWQYASABKAUiVQoMQXJlbmFNZXNzYWdlEkUKF3JlcGVhdGVkX25lc3RlZF9tZXNzYWdlGAEgAygLMiQucHJvdG8yX2FyZW5hX3VuaXR0ZXN0Lk5lc3RlZE1lc3NhZ2VCCPgBAZIDAhgCYghlZGl0aW9uc3DoBw");

/**
 * @generated from message proto2_arena_unittest.NestedMessage
 */
export type NestedMessage = Message<"proto2_arena_unittest.NestedMessage"> & {
  /**
   * @generated from field: int32 d = 1;
   */
  d: number;
};

/**
 * Describes the message proto2_arena_unittest.NestedMessage.
 * Use `create(NestedMessageSchema)` to create a new message.
 */
export const NestedMessageSchema: GenMessage<NestedMessage> = /*@__PURE__*/
  messageDesc(file_google_protobuf_unittest_arena, 0);

/**
 * @generated from message proto2_arena_unittest.ArenaMessage
 */
export type ArenaMessage = Message<"proto2_arena_unittest.ArenaMessage"> & {
  /**
   * @generated from field: repeated proto2_arena_unittest.NestedMessage repeated_nested_message = 1;
   */
  repeatedNestedMessage: NestedMessage[];
};

/**
 * Describes the message proto2_arena_unittest.ArenaMessage.
 * Use `create(ArenaMessageSchema)` to create a new message.
 */
export const ArenaMessageSchema: GenMessage<ArenaMessage> = /*@__PURE__*/
  messageDesc(file_google_protobuf_unittest_arena, 1);

