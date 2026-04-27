import type { PubSubInterceptor, PubSubInterceptorContext, PubSubInterceptorFn } from "./types.js";

/**
 * Chain interceptors around a core function and invoke the resulting pipeline.
 *
 * Interceptors are applied from last to first so the first interceptor in the
 * array is the outermost in the call chain, matching the connectrpc and
 * {@link @protoutil/repo} convention.
 *
 * Errors thrown by interceptors propagate to the caller. Use this for
 * user-facing operations (`publish`, `handle`) where interceptor errors
 * should affect the outcome.
 */
export function applyPubSubInterceptors<R>(
  interceptors: PubSubInterceptor[] | undefined,
  ctx: PubSubInterceptorContext,
  core: (ctx: PubSubInterceptorContext) => Promise<R>,
): Promise<R> {
  let fn: PubSubInterceptorFn = core as PubSubInterceptorFn;
  if (interceptors) {
    for (let i = interceptors.length - 1; i >= 0; i--) {
      fn = interceptors[i](fn);
    }
  }
  return fn(ctx) as Promise<R>;
}

/**
 * Fire a lifecycle notification through the interceptor chain.
 *
 * The core function is a no-op. All errors thrown by interceptors are caught
 * so lifecycle hooks never break delivery flow.
 */
export async function notifyInterceptors(
  interceptors: PubSubInterceptor[] | undefined,
  ctx: PubSubInterceptorContext,
): Promise<void> {
  if (!interceptors?.length) {
    return;
  }
  try {
    let fn: PubSubInterceptorFn = async () => {};
    for (let i = interceptors.length - 1; i >= 0; i--) {
      fn = interceptors[i](fn);
    }
    await fn(ctx);
  } catch {
    // Lifecycle interceptor hooks are diagnostics, not part of the delivery
    // transaction.
  }
}
