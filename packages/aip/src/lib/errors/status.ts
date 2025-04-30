import { Code } from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/code_pb.js';
import {
  BadRequest,
  BadRequestSchema,
  DebugInfo,
  DebugInfoSchema,
  ErrorInfo,
  ErrorInfoSchema,
  Help,
  HelpSchema,
  LocalizedMessage,
  LocalizedMessageSchema,
  PreconditionFailure,
  PreconditionFailureSchema,
  QuotaFailure,
  QuotaFailureSchema,
  RequestInfo,
  RequestInfoSchema,
  ResourceInfo,
  ResourceInfoSchema,
  RetryInfo,
  RetryInfoSchema,
} from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/error_details_pb.js';
import { StatusSchema } from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/status_pb.js';
import { create, createRegistry, MessageInitShape } from '@bufbuild/protobuf';
import { Any, anyPack, anyUnpack } from '@bufbuild/protobuf/wkt';

const statusErrorRegistry = createRegistry(
  ErrorInfoSchema,
  RetryInfoSchema,
  DebugInfoSchema,
  QuotaFailureSchema,
  PreconditionFailureSchema,
  BadRequestSchema,
  RequestInfoSchema,
  ResourceInfoSchema,
  HelpSchema,
  LocalizedMessageSchema
);

/**
 * Initialization for error details for a google.rpc.Status message
 */
export interface ErrorDetailsInit {
  errorInfo: MessageInitShape<typeof ErrorInfoSchema>;
  retryInfo?: MessageInitShape<typeof RetryInfoSchema>;
  debugInfo?: MessageInitShape<typeof DebugInfoSchema>;
  quotaFailure?: MessageInitShape<typeof QuotaFailureSchema>;
  preconditionFailure?: MessageInitShape<typeof PreconditionFailureSchema>;
  badRequest?: MessageInitShape<typeof BadRequestSchema>;
  requestInfo?: MessageInitShape<typeof RequestInfoSchema>;
  resourceInfo?: MessageInitShape<typeof ResourceInfoSchema>;
  help?: MessageInitShape<typeof HelpSchema>;
  localizedMessage?: MessageInitShape<typeof LocalizedMessageSchema>;
}

/**
 * Error details for a google.rpc.Status message
 */
export interface ErrorDetails {
  errorInfo: ErrorInfo;
  retryInfo?: RetryInfo;
  debugInfo?: DebugInfo;
  quotaFailure?: QuotaFailure;
  preconditionFailure?: PreconditionFailure;
  badRequest?: BadRequest;
  requestInfo?: RequestInfo;
  resourceInfo?: ResourceInfo;
  help?: Help;
  localizedMessage?: LocalizedMessage;
}

/**
 * Creates an ErrorDetails object
 */
export function errorDetails(init: ErrorDetailsInit) {
  const details: ErrorDetails = {
    errorInfo: create(ErrorInfoSchema, init.errorInfo),
  };
  if (init.retryInfo) {
    details.retryInfo = create(RetryInfoSchema, init.retryInfo);
  }
  if (init.debugInfo) {
    details.debugInfo = create(DebugInfoSchema, init.debugInfo);
  }
  if (init.quotaFailure) {
    details.quotaFailure = create(QuotaFailureSchema, init.quotaFailure);
  }
  if (init.preconditionFailure) {
    details.preconditionFailure = create(PreconditionFailureSchema, init.preconditionFailure);
  }
  if (init.badRequest) {
    details.badRequest = create(BadRequestSchema, init.badRequest);
  }
  if (init.requestInfo) {
    details.requestInfo = create(RequestInfoSchema, init.requestInfo);
  }
  if (init.resourceInfo) {
    details.resourceInfo = create(ResourceInfoSchema, init.resourceInfo);
  }
  if (init.help) {
    details.help = create(HelpSchema, init.help);
  }
  if (init.localizedMessage) {
    details.localizedMessage = create(LocalizedMessageSchema, init.localizedMessage);
  }
  return details;
}

/**
 * Packs google.rpc.Status error details into an array of google.protobuf.Any messages.
 */
export function packErrorDetails(init: ErrorDetailsInit) {
  const details: Any[] = [anyPack(ErrorInfoSchema, create(ErrorInfoSchema, init.errorInfo))];
  if (init.retryInfo) {
    details.push(anyPack(RetryInfoSchema, create(RetryInfoSchema, init.retryInfo)));
  }
  if (init.debugInfo) {
    details.push(anyPack(DebugInfoSchema, create(DebugInfoSchema, init.debugInfo)));
  }
  if (init.quotaFailure) {
    details.push(anyPack(QuotaFailureSchema, create(QuotaFailureSchema, init.quotaFailure)));
  }
  if (init.preconditionFailure) {
    details.push(
      anyPack(
        PreconditionFailureSchema,
        create(PreconditionFailureSchema, init.preconditionFailure)
      )
    );
  }
  if (init.badRequest) {
    details.push(anyPack(BadRequestSchema, create(BadRequestSchema, init.badRequest)));
  }
  if (init.requestInfo) {
    details.push(anyPack(RequestInfoSchema, create(RequestInfoSchema, init.requestInfo)));
  }
  if (init.resourceInfo) {
    details.push(anyPack(ResourceInfoSchema, create(ResourceInfoSchema, init.resourceInfo)));
  }
  if (init.help) {
    details.push(anyPack(HelpSchema, create(HelpSchema, init.help)));
  }
  if (init.localizedMessage) {
    details.push(
      anyPack(LocalizedMessageSchema, create(LocalizedMessageSchema, init.localizedMessage))
    );
  }
  return details;
}

/**
 * Unpacks google.rpc.Status error details from an array of google.protobuf.Any messages.
 */
export function unpackErrorDetails(details: Any[]) {
  const result: ErrorDetails = {} as ErrorDetails;
  for (const detail of details) {
    const unpacked = anyUnpack(detail, statusErrorRegistry);
    switch (unpacked?.$typeName) {
      case ErrorInfoSchema.typeName:
        result.errorInfo = unpacked as ErrorInfo;
        break;
      case RetryInfoSchema.typeName:
        result.retryInfo = unpacked as RetryInfo;
        break;
      case DebugInfoSchema.typeName:
        result.debugInfo = unpacked as DebugInfo;
        break;
      case QuotaFailureSchema.typeName:
        result.quotaFailure = unpacked as QuotaFailure;
        break;
      case PreconditionFailureSchema.typeName:
        result.preconditionFailure = unpacked as PreconditionFailure;
        break;
      case BadRequestSchema.typeName:
        result.badRequest = unpacked as BadRequest;
        break;
      case RequestInfoSchema.typeName:
        result.requestInfo = unpacked as RequestInfo;
        break;
      case ResourceInfoSchema.typeName:
        result.resourceInfo = unpacked as ResourceInfo;
        break;
      case HelpSchema.typeName:
        result.help = unpacked as Help;
        break;
      case LocalizedMessageSchema.typeName:
        result.localizedMessage = unpacked as LocalizedMessage;
        break;
      default:
        break;
    }
  }
  return result;
}

/**
 * Initialization for a google.rpc.Status message
 */
export interface StatusInit extends ErrorDetailsInit {
  code: Code;
  message: string;
}

/**
 * Creates a google.rpc.Status message. Per [AIP-193](https://google.aip.dev/193),
 * each detail field may only be set once. So, this function uses an object to
 * initialize the details field as apposed to an array.
 */
export function status(init: StatusInit) {
  const { code, message, ...errorDetails } = init;
  const details = packErrorDetails(errorDetails);
  return create(StatusSchema, {
    code,
    message,
    details,
  });
}

/**
 * Creates a google.rpc.Status message with an OK code and message.
 */
export const OK_STATUS = status({
  code: Code.OK,
  message: 'OK',
  errorInfo: {},
});
