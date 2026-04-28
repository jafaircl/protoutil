import Fastify from "fastify";
import app from "./app.js";
import { closeEngines } from "./engines.js";
import { closePubsub } from "./pubsub.js";

const server = Fastify({ logger: true });

server.register(app);

const start = async () => {
  try {
    await server.listen({ port: 8080, host: "0.0.0.0" });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// tsx watch sends SIGTERM on reload
process.on("SIGTERM", async () => {
  await server.close();
  await closeEngines();
  await closePubsub();
  process.exit(0);
});

// Cleanup on normal exit
process.on("exit", async () => {
  await closePubsub();
});

start();
