import Fastify, { FastifyServerOptions } from 'fastify';
import { routes } from './plugins/routes/routes.js';
import { dbConnector } from './plugins/dbConnector.js';

export function buildFastify(options: FastifyServerOptions = {}) {
  const fastify = Fastify(options);

  fastify.register(dbConnector);
  fastify.register(routes);

  return fastify;
}
