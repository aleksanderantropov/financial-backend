import Fastify from 'fastify';
import { routes } from './plugins/routes/routes.js';
import { dbConnector } from './plugins/dbConnector.js';

const DEFAULT_PORT = 3000;

const fastify = Fastify({
  logger: true,
});

fastify.register(dbConnector);
fastify.register(routes);

try {
  await fastify.listen({ port: Number(process.env.PORT ?? DEFAULT_PORT) });
} catch (error) {
  fastify.log.error(error);
  process.exit(1);
}
