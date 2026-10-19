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
      await connection.query('BEGIN');

      const transfer = await connection.query(
        'INSERT INTO transfers (idempotency_key, source_account_id, target_account_id, amount_minor, currency_code) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [
          idempotency_key,
          source_account_id,
          target_account_id,
          amount_minor,
          currency_code,
        ],
      );

      await connection.query('COMMIT');
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  };
}
