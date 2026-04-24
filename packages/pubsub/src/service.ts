import type { DescMethodUnary } from "@bufbuild/protobuf";
import type { GenService, GenServiceMethods } from "@bufbuild/protobuf/codegenv2";

/** Return the unary methods from a generated service descriptor. */
export function unaryMethods(service: GenService<GenServiceMethods>): DescMethodUnary[] {
  // V1 uses unary methods as the contract surface. Streaming methods are out of
  // scope until the pubsub shape is clearer.
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
    throw new Error(`unknown service method: ${service.typeName}.${localName}`);
  }
  return method;
}
