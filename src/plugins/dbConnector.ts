import postgres from '@fastify/postgres';
import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

export const dbConnector = fastifyPlugin(function dbConnectorBase(
  fastify: FastifyInstance,
) {
  fastify.register(postgres, {
    connectionString: process.env.DATABASE_URL,
  });
});
