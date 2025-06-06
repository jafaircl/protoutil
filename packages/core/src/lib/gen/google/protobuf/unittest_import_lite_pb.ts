// @generated by protoc-gen-es v2.5.1 with parameter "target=ts,import_extension=.js,ts_nocheck=false"
// @generated from file google/protobuf/unittest_import_lite.proto (package proto2_unittest_import, edition 2023)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage } from "@bufbuild/protobuf/codegenv2";
import { enumDesc, fileDesc, messageDesc } from "@bufbuild/protobuf/codegenv2";
import { file_google_protobuf_unittest_import_public_lite } from "./unittest_import_public_lite_pb.js";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file google/protobuf/unittest_import_lite.proto.
 */
export const file_google_protobuf_unittest_import_lite: GenFile = /*@__PURE__*/
  fileDesc("Cipnb29nbGUvcHJvdG9idWYvdW5pdHRlc3RfaW1wb3J0X2xpdGUucHJvdG8SFnByb3RvMl91bml0dGVzdF9pbXBvcnQiHgoRSW1wb3J0TWVzc2FnZUxpdGUSCQoBZBgBIAEoBSpVCg5JbXBvcnRFbnVtTGl0ZRITCg9JTVBPUlRfTElURV9GT08QBxITCg9JTVBPUlRfTElURV9CQVIQCBITCg9JTVBPUlRfTElURV9CQVoQCRoEOgIQAkIXChNjb20uZ29vZ2xlLnByb3RvYnVmSANQAGIIZWRpdGlvbnNw6Ac", [file_google_protobuf_unittest_import_public_lite]);

/**
 * @generated from message proto2_unittest_import.ImportMessageLite
 */
export type ImportMessageLite = Message<"proto2_unittest_import.ImportMessageLite"> & {
  /**
   * @generated from field: int32 d = 1;
   */
  d: number;
};

/**
 * Describes the message proto2_unittest_import.ImportMessageLite.
 * Use `create(ImportMessageLiteSchema)` to create a new message.
 */
export const ImportMessageLiteSchema: GenMessage<ImportMessageLite> = /*@__PURE__*/
  messageDesc(file_google_protobuf_unittest_import_lite, 0);

/**
 * @generated from enum proto2_unittest_import.ImportEnumLite
 * @generated with option features.enum_type = CLOSED
 */
export enum ImportEnumLite {
  /**
   * @generated from enum value: IMPORT_LITE_FOO = 7;
   */
  IMPORT_LITE_FOO = 7,

  /**
   * @generated from enum value: IMPORT_LITE_BAR = 8;
   */
  IMPORT_LITE_BAR = 8,

  /**
   * @generated from enum value: IMPORT_LITE_BAZ = 9;
   */
  IMPORT_LITE_BAZ = 9,
}

/**
 * Describes the enum proto2_unittest_import.ImportEnumLite.
 */
export const ImportEnumLiteSchema: GenEnum<ImportEnumLite> = /*@__PURE__*/
  enumDesc(file_google_protobuf_unittest_import_lite, 0);

