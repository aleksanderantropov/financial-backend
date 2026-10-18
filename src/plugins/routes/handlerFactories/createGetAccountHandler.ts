import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';
import { getAccountSchema } from '../schemas/getAccountSchema.js';

type GetAccountRoute = {
  Params: FromSchema<typeof getAccountSchema.params>;
};

export function createGetAccountHandler(fastify: FastifyInstance) {
  return async (
    request: FastifyRequest<GetAccountRoute>,
    reply: FastifyReply<GetAccountRoute>,
  ) => {
    const { id } = request.params;

    const result = await fastify.pg.query(
      'SELECT * FROM accounts WHERE id = $1',
      [id],
    );

    if (!result.rows.length) {
      return reply.code(404).send({
        error: 'Account not found',
      });
    }

    return result.rows[0];
  };
}
