import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import { FastifyInstance } from 'fastify';
import { getAccountSchema } from './schemas/getAccountSchema.js';
import { createGetAccountHandler } from './handlerFactories/createGetAccountHandler.js';
import { postTransfersSchema } from './schemas/postTransfersSchema.js';

export function routes(_fastify: FastifyInstance) {
  const fastify = _fastify.withTypeProvider<JsonSchemaToTsProvider>();

  fastify.get(
    '/accounts/:id',
    {
      schema: getAccountSchema,
    },
    createGetAccountHandler(fastify),
  );

  fastify.post(
    '/transfers',
    { schema: postTransfersSchema },
    createPostTransfersHandler(fastify),
  );
}
