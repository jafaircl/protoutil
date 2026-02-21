import type { FastifyPluginAsync } from "fastify";

const example: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get("/", async () => "this is an example");
};

export default example;
