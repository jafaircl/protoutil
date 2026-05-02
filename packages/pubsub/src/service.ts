import type { DescMethodUnary } from "@bufbuild/protobuf";
import type { GenService, GenServiceMethods } from "@bufbuild/protobuf/codegenv2";
import { UnknownServiceMethodPubSubError } from "./errors.js";

/** Return the unary methods from a generated service descriptor.
 *
 * Services use unary methods as the event contract surface. Streaming methods
 * are not supported by this pub/sub library (different delivery model).
 */
export function unaryMethods(service: GenService<GenServiceMethods>): DescMethodUnary[] {
  return service.methods.filter(
    (method): method is DescMethodUnary => method.methodKind === "unary",
  );
}

/** Find a unary method by local TypeScript method name. */
export function unaryMethod(
  service: GenService<GenServiceMethods>,
  localName: string,
): DescMethodUnary {
  const method = unaryMethods(service).find((candidate) => candidate.localName === localName);
  if (!method) {
    throw new UnknownServiceMethodPubSubError(
      `unknown service method: ${service.typeName}.${localName}`,
    );
  }
  return method;
}
