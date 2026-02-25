import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { fastifyConnectPlugin } from "@connectrpc/connect-fastify";
import AutoLoad, { type AutoloadPluginOptions } from "@fastify/autoload";
import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import routes from "./connect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type AppOptions = {
  // Place your custom options for app below here.
} & Partial<AutoloadPluginOptions>;

// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {};

const app: FastifyPluginAsync<AppOptions> = async (fastify, opts): Promise<void> => {
  // Place here your custom code!
  fastify.register(cors);
  fastify.register(fastifyConnectPlugin, {
    routes,
  });

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
