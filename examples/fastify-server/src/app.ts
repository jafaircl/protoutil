import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Interceptor } from "@connectrpc/connect";
import { fastifyConnectPlugin } from "@connectrpc/connect-fastify";
import AutoLoad, { type AutoloadPluginOptions } from "@fastify/autoload";
import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import routes from "./connect.js";
import { initPubsub, startEventSubscription } from "./pubsub.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type AppOptions = {
  // Place your custom options for app below here.
} & Partial<AutoloadPluginOptions>;

// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {};

/** ConnectRPC interceptor that logs every RPC call with its duration. */
const connectLogger: Interceptor = (next) => async (req) => {
  const start = performance.now();
  try {
    const res = await next(req);
    console.log(`[rpc] ${req.method.name} (${(performance.now() - start).toFixed(1)}ms)`);
    return res;
  } catch (err) {
    console.error(
      `[rpc] ${req.method.name} FAILED (${(performance.now() - start).toFixed(1)}ms)`,
      err,
    );
    throw err;
  }
};

const app: FastifyPluginAsync<AppOptions> = async (fastify, opts): Promise<void> => {
  // Initialize pubsub AFTER fastify is ready but BEFORE accepting requests
  await initPubsub();

  // Place here your custom code!
  fastify.register(cors);
  fastify.register(fastifyConnectPlugin, {
    routes,
    interceptors: [connectLogger],
  });

  // Start the event subscription (runs handlers when resources are created/updated/deleted)
  await startEventSubscription();

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  // eslint-disable-next-line no-void
  void fastify.register(AutoLoad, {
    dir: path.join(__dirname, "plugins"),
    options: opts,
    forceESM: true,
    matchFilter: (path) => path.endsWith(".ts") || path.endsWith(".js"),
  });

  // This loads all plugins defined in routes
  // define your routes in one of these
  // eslint-disable-next-line no-void
  void fastify.register(AutoLoad, {
    dir: path.join(__dirname, "routes"),
    options: opts,
    forceESM: true,
    matchFilter: (path) => path.endsWith(".ts") || path.endsWith(".js"),
  });
};

export default app;
export { app, options };
