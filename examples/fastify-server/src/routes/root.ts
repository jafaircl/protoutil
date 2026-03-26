import type { FastifyPluginAsync } from "fastify";

const root: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get("/", async () => ({ root: true }));
};

export default root;
