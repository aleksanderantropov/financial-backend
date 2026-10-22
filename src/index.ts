import { buildFastify } from './buildFastify.js';

const DEFAULT_PORT = 3000;

const fastify = buildFastify({
  logger: true,
});

try {
  await fastify.listen({ port: Number(process.env.PORT ?? DEFAULT_PORT) });
} catch (error) {
  fastify.log.error(error);
  process.exit(1);
}
