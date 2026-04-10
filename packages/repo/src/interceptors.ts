import type { DescMessage } from "@bufbuild/protobuf";
import type { Interceptor, InterceptorContext, InterceptorFn } from "./types.js";

export function applyInterceptors<Desc extends DescMessage, R>(
  interceptors: Interceptor<Desc>[] | undefined,
  ctx: InterceptorContext<Desc>,
  core: (ctx: InterceptorContext<Desc>) => Promise<R>,
): Promise<R> {
  let fn: InterceptorFn<Desc> = core as InterceptorFn<Desc>;
  if (interceptors) {
    for (let i = interceptors.length - 1; i >= 0; i--) {
      fn = interceptors[i](fn);
    }
  }
  return fn(ctx) as Promise<R>;
}

export function expectOperation<
  Desc extends DescMessage,
  Op extends InterceptorContext<Desc>["operation"],
>(
  ctx: InterceptorContext<Desc>,
  operation: Op,
): Extract<InterceptorContext<Desc>, { operation: Op }> {
  if (ctx.operation !== operation) {
    throw new Error(`Unexpected interceptor context: expected ${operation}, got ${ctx.operation}`);
  }
  return ctx as Extract<InterceptorContext<Desc>, { operation: Op }>;
}
