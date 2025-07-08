/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-case-declarations */

import { isMessage, Message } from '@bufbuild/protobuf';
import { Env } from './env.js';

/**
 * Normalizes the keys of a message to match the original proto field names.
 */
export function normalizeMessageKeys(env: Env, message: Message) {
  const schema = env.CELTypeProvider().findStructProtoType(message.$typeName);
  if (!schema) {
    throw new Error(`Unknown message type: ${message.$typeName}`);
  }
  const normalized: Record<string, any> = {
    $typeName: message.$typeName,
    $unknown: message.$unknown,
  };
  for (const field of schema.fields) {
    switch (field.fieldKind) {
      case 'list':
        normalized[field.name] = (message[field.jsonName as keyof Message] as any[]).map((item) => {
          if (isMessage(item)) {
            return normalizeMessageKeys(env, item);
          }
          return item;
        });
        break;
      case 'map':
        normalized[field.name] = Object.fromEntries(
          Object.entries(message[field.jsonName as keyof Message] as Record<string, any>).map(
            ([key, value]) => {
              if (isMessage(value)) {
                return [key, normalizeMessageKeys(env, value)];
              }
              return [key, value];
            }
          )
        );
        break;
      case 'message':
        const subMessage = message[field.jsonName as keyof Message];
        if (isMessage(subMessage)) {
          normalized[field.name] = normalizeMessageKeys(env, subMessage);
        } else {
          normalized[field.name] = subMessage; // Handle non-message types gracefully
        }
        break;
      case 'scalar':
      case 'enum':
        normalized[field.name] = message[field.jsonName as keyof Message];
        break;
    }
  }
  return normalized;
}
