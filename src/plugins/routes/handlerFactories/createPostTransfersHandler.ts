import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FromSchema } from 'json-schema-to-ts';
import { postTransfersSchema } from '../schemas/postTransfersSchema.js';

type PostTransfersRoute = {
  Body: FromSchema<typeof postTransfersSchema.body>;
  Headers: FromSchema<typeof postTransfersSchema.headers>;
};

export function createPostTransfersHandler(fastify: FastifyInstance) {
  return async (
    request: FastifyRequest<PostTransfersRoute>,
    reply: FastifyReply<PostTransfersRoute>,
  ) => {
    const {
      amount_minor,
      currency_code,
      source_account_id,
      target_account_id,
    } = request.body;

    const idempotency_key = request.headers['idempotency-key'];

    const connection = await fastify.pg.connect();

    try {
      connection.query('BEGIN');

      // transfer logic

      connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  };
}
