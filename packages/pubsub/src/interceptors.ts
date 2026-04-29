import type { PubSubInterceptor, PubSubInterceptorContext, PubSubInterceptorFn } from "./types.js";

type InterceptorComposer = (core: PubSubInterceptorFn) => PubSubInterceptorFn;

const noopInterceptorFn: PubSubInterceptorFn = async () => {};
const interceptorComposers = new WeakMap<PubSubInterceptor[], InterceptorComposer>();
const lifecycleChains = new WeakMap<PubSubInterceptor[], PubSubInterceptorFn>();

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
 *
 * Lifecycle operations (`scheduled`, `committed`, etc.) are handled by notifyInterceptors
 * which catches all errors to prevent breaking delivery flow.
 */
export function applyPubSubInterceptors<R>(
  interceptors: PubSubInterceptor[] | undefined,
  ctx: PubSubInterceptorContext,
  core: (ctx: PubSubInterceptorContext) => Promise<R>,
): Promise<R> {
  const fn = composeInterceptors(interceptors)(core as PubSubInterceptorFn);
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
    // Lifecycle notifications always use the same no-op core, so compile that
    // once per interceptor array and reuse it for every event.
    let fn = lifecycleChains.get(interceptors);
    if (!fn) {
      fn = composeInterceptors(interceptors)(noopInterceptorFn);
      lifecycleChains.set(interceptors, fn);
    }
    await fn(ctx);
  } catch {
    // Lifecycle interceptor hooks are diagnostics, not part of the delivery
    // transaction.
  }
}

/** Build and cache the higher-order interceptor composition for one array. */
function composeInterceptors(interceptors: PubSubInterceptor[] | undefined): InterceptorComposer {
  if (!interceptors?.length) {
    return (core) => core;
  }
  let composer = interceptorComposers.get(interceptors);
  if (!composer) {
    // Precompose the middleware structure once so hot publish and handle paths
    // do not rebuild the interceptor nesting for every operation.
    composer = interceptors.reduceRight<InterceptorComposer>(
      (nextComposer, interceptor) => (core) => interceptor(nextComposer(core)),
      (core) => core,
    );
    interceptorComposers.set(interceptors, composer);
  }
  return composer;
}
